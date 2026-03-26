const db = require("../config/db");
const socketService = require("../services/socketService");
const { Contact, User } = require("../models");
const { sendText } = require("../services/whatsappService");
const { upsertConversationWithQuota } = require('../services/conversationBillingService');

// Defaults shown in the Opt-in Management UI
const OPT_IN_MESSAGE =
  'Thanks! You have been opted in for future marketing messages. You will now receive updates and notifications related to this project.';
const OPT_OUT_MESSAGE =
  'You have been opted out of your future marketing messages. If you would like to receive messages again, reply APPLY above US/APPLY.';

// AiSensy-style: use conversations + message table.
// New customer message → REQUESTING; existing → keep current status (requesting/active/intervened).
// Also route inbounds to the correct agent_* or manager room based on conversations.agent_id.
exports.receiveMessage = async (req, res) => {
  try {
    console.log("Incoming WhatsApp webhook payload (agent webhook):", JSON.stringify(req.body, null, 2));

    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const phone = message.from;
    const text = message.text?.body || "";

    // Consent handling for the Contacts table:
    // - First message for a new contact => opt-in (unless STOP/UNSUBSCRIBE/CANCEL)
    // - STOP/UNSUBSCRIBE/CANCEL => opt-out
    const normalizedText = (text || "").toString().trim().toUpperCase();
    const optOutKeywords = ["STOP", "UNSUBSCRIBE", "CANCEL"];
    const isOptOut =
      optOutKeywords.includes(normalizedText) ||
      optOutKeywords.some((k) => normalizedText.includes(k));
    const isOptInKeyword =
      normalizedText === "START" || normalizedText === "YES" || normalizedText === "HI";

    // Update/ensure consent state in DB so admins see it in Contacts table
    try {
      let contact = await Contact.findOne({ where: { phone } });
      const wasNewContact = !contact;
      const oldOptedOut = contact
        ? contact.status === 'unsubscribed' || !contact.whatsappOptInAt
        : false;

      if (!contact) {
        const firstUser = await User.findOne({
          where: { status: "active" },
          order: [["id", "ASC"]],
        });

        if (firstUser) {
          contact = await Contact.create({
            userId: firstUser.id,
            phone,
            name: phone,
            status: isOptOut ? "unsubscribed" : "active",
            whatsappOptInAt: isOptOut ? null : new Date(),
          });
        }
      } else {
        if (isOptOut) {
          await contact.update({ status: "unsubscribed", whatsappOptInAt: null });
        } else if (isOptInKeyword && !contact.whatsappOptInAt) {
          await contact.update({ status: "active", whatsappOptInAt: new Date() });
        } else if (wasNewContact && contact.status !== "unsubscribed" && !contact.whatsappOptInAt) {
          // Safety net (shouldn't happen often because create sets the timestamp)
          await contact.update({ status: "active", whatsappOptInAt: new Date() });
        }
      }

      if (contact) {
        await contact.update({ lastContacted: new Date() });
      }

      // Auto-reply on first consent change
      let billingAllowed = true;
      try {
        if (contact) {
          const billing = await upsertConversationWithQuota(contact.userId, phone);
          billingAllowed = !!billing.allowed;
        }
      } catch (billingErr) {
        console.error('Conversation billing check failed (whatsappWebhook):', billingErr?.message || billingErr);
      }

      try {
        if (billingAllowed) {
          if (!isOptOut && normalizedText === "HI") {
            await sendText(phone, OPT_IN_MESSAGE);
          } else if (isOptOut && !oldOptedOut) {
            await sendText(phone, OPT_OUT_MESSAGE);
          }
        }
      } catch (e) {
        console.error('Auto reply sendText failed (agent webhook):', e?.message || e);
      }
    } catch (consentErr) {
      console.error("Consent sync to Contacts table failed:", consentErr);
    }

    // 1️⃣ Find or create open conversation for this phone
    const [rows] = await db.query(
      "SELECT * FROM conversations WHERE phone = ? AND status != 'closed' ORDER BY id DESC LIMIT 1",
      [phone]
    );

    let convId;

    if (rows.length === 0) {
      const [result] = await db.query(
        "INSERT INTO conversations (phone, last_message, status) VALUES (?, ?, 'requesting')",
        [phone, text]
      );
      convId = result.insertId;
    } else {
      convId = rows[0].id;
      await db.query(
        "UPDATE conversations SET last_message = ? WHERE id = ?",
        [text, convId]
      );
    }

    // 2️⃣ Persist message in message table
    await db.query(
      "INSERT INTO message (conversation_id, sender, message) VALUES (?, ?, ?)",
      [convId, "customer", text]
    );

    // 3️⃣ Always send to Manager Inbox only (assign flow: Manager → Assign → Agent Requesting)
    const payload = {
      conversationId: convId,
      phone,
      message: text,
    };
    socketService.emitToManager("new-message", payload);

    res.sendStatus(200);
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      hint:
        err.code === "ER_NO_SUCH_TABLE"
          ? "Run backend/sql/chat_messages_table.sql and ensure conversations table exists."
          : undefined,
    });
  }
};
