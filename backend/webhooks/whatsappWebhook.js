const db = require("../config/db");
const socketService = require("../services/socketService");

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
