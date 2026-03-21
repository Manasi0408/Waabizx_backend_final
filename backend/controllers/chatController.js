const db = require("../config/db");
const { Contact, Message, InboxMessage, User } = require("../models");
const socketService = require("../services/socketService");
const { sendText, sendTemplate } = require("../services/whatsappService");

// Shared list shape for Live Chat: id, phone, customer_name, last_message, last_message_time, unread_count, status
const conversationListFields = `
  c.id,
  c.phone,
  c.phone AS customer_name,
  c.last_message,
  c.status,
  (SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id) AS last_message_time,
  0 AS unread_count
`;

exports.receiveMessage = async (req, res) => {
  try {
    const phone = req.body.phone;
    const message = req.body.message;

    const [rows] = await db.query(
      "SELECT * FROM conversations WHERE phone=? AND status!='closed'",
      [phone]
    );

    let convId;

    if (rows.length === 0) {
      const [result] = await db.query(
        "INSERT INTO conversations (phone, last_message, status) VALUES (?, ?, 'requesting')",
        [phone, message]
      );
      convId = result.insertId;
    } else {
      convId = rows[0].id;
    }

    await db.query(
      "INSERT INTO message (conversation_id, sender, message) VALUES (?, ?, ?)",
      [convId, "customer", message]
    );
    await db.query(
      "UPDATE conversations SET last_message = ? WHERE id = ?",
      [message, convId]
    );

    // Sync to inbox (Contact + Message + InboxMessage) so /inbox shows customer messages too
    try {
      const normalizedPhone = (phone || "").toString().trim();
      if (normalizedPhone) {
        let contact = await Contact.findOne({ where: { phone: normalizedPhone } });
        if (!contact) {
          const firstUser = await User.findOne({
            where: { status: "active" },
            order: [["id", "ASC"]],
            attributes: ["id"],
          });
          if (firstUser) {
            contact = await Contact.create({
              userId: firstUser.id,
              phone: normalizedPhone,
              name: normalizedPhone,
              status: "active",
            });
          }
        }
        if (contact) {
          await Message.create({
            contactId: contact.id,
            content: message,
            type: "incoming",
            status: "delivered",
            sentAt: new Date(),
          });
          await InboxMessage.create({
            contactId: contact.id,
            userId: contact.userId,
            direction: "incoming",
            message: message,
            type: "text",
            status: "delivered",
            timestamp: new Date(),
          });
          await contact.update({ lastContacted: new Date() });
          try {
            socketService.emitToUser(contact.userId, "inbox-update", { contactId: contact.id });
            socketService.emitToManager("inbox-update", { contactId: contact.id });
          } catch (e) {}
        }
      }
    } catch (inboxErr) {
      console.error("Error syncing receiveMessage to inbox:", inboxErr);
    }

    res.json({ message: "Message received" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Manager Inbox: requesting conversations not yet assigned (agent_id IS NULL)
exports.getManagerRequesting = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${conversationListFields}
       FROM conversations c
       WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'requesting'
         AND c.agent_id IS NULL
       ORDER BY last_message_time DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Agent Requesting Tab: conversations assigned to this agent with status=requesting
exports.getAgentRequesting = async (req, res) => {
  try {
    const agentId = req.query.agentId;
    if (!agentId) {
      return res.status(400).json({ error: "agentId query is required" });
    }
    const [rows] = await db.query(
      `SELECT ${conversationListFields}
       FROM conversations c
       WHERE c.agent_id = ? AND LOWER(TRIM(COALESCE(c.status,''))) = 'requesting'
       ORDER BY last_message_time DESC`,
      [agentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 1️⃣ MANAGER: see all conversations (any status)
exports.getManagerConversations = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${conversationListFields}
       FROM conversations c
       ORDER BY last_message_time DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 2️⃣ AGENT: see only conversations assigned to this agent_id (other agents' intervened chats not visible)
const getCurrentUser = (req) => {
  const u = req.user;
  if (!u) return { id: null, role: "" };
  const id = u.id != null ? Number(u.id) : (u.dataValues && u.dataValues.id != null ? Number(u.dataValues.id) : null);
  const role = (u.role != null ? String(u.role) : (u.dataValues && u.dataValues.role != null ? String(u.dataValues.role) : "")) || "";
  return { id, role };
};

exports.getAgentConversations = async (req, res) => {
  try {
    const { id: agentId } = getCurrentUser(req);

    if (agentId == null) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: missing authenticated user",
      });
    }

    const [rows] = await db.query(
      `SELECT ${conversationListFields}
       FROM conversations c
       WHERE c.agent_id = ?
         AND LOWER(TRIM(COALESCE(c.status,''))) IN ('active','intervened')
       ORDER BY last_message_time DESC`,
      [agentId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

const isAgentRole = (role) => (role || "").toString().toLowerCase() === "agent";
const isManagerRole = (role) => ["admin", "manager"].includes((role || "").toString().toLowerCase());

exports.getRequestingChats = async (req, res) => {
  try {
    const { id: userId, role } = getCurrentUser(req);

    let rows;

    if (isAgentRole(role)) {
      // Agent: see conversations assigned to them that are still requesting (<24h)
      const [agentRows] = await db.query(
        `SELECT ${conversationListFields}
         FROM conversations c
         WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'requesting'
           AND c.agent_id = ?
           AND TIMESTAMPDIFF(
                 HOUR,
                 (SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id),
                 NOW()
               ) < 24
         ORDER BY last_message_time DESC`,
        [userId]
      );
      rows = agentRows;
    } else {
      // Manager: see unassigned requesting conversations (<24h)
      const [managerRows] = await db.query(
        `SELECT ${conversationListFields}
         FROM conversations c
         WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'requesting'
           AND c.agent_id IS NULL
           AND TIMESTAMPDIFF(
                 HOUR,
                 (SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id),
                 NOW()
               ) < 24
         ORDER BY last_message_time DESC`
      );
      rows = managerRows;
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getActiveChats = async (req, res) => {
  try {
    const { id: userId, role } = getCurrentUser(req);

    let rows;

    if (isAgentRole(role)) {
      // Agent: only see their own active chats (intervened by another agent = different agent_id = not returned)
      [rows] = await db.query(
        `SELECT ${conversationListFields}
         FROM conversations c
         WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'active'
           AND c.agent_id = ?
         ORDER BY last_message_time DESC`,
        [userId]
      );
    } else {
      // Manager / others: see all active chats
      [rows] = await db.query(
        `SELECT ${conversationListFields}
         FROM conversations c
         WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'active'
         ORDER BY last_message_time DESC`
      );
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getIntervenedChats = async (req, res) => {
  try {
    const { id: userId, role } = getCurrentUser(req);

    let rows;

    if (isAgentRole(role)) {
      // Agent: only their own intervened chats (another agent's intervened conversation not visible)
      [rows] = await db.query(
        `SELECT ${conversationListFields}
         FROM conversations c
         WHERE c.agent_id = ?
           AND (
             LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
             OR (
               LOWER(TRIM(COALESCE(c.status,''))) = 'requesting'
               AND TIMESTAMPDIFF(
                     HOUR,
                     (SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id),
                     NOW()
                   ) >= 24
             )
           )
         ORDER BY last_message_time DESC`,
        [userId]
      );
    } else {
      // Manager: see all intervened chats
      // Same definition as above, but without agent_id filter
      [rows] = await db.query(
        `SELECT ${conversationListFields}
         FROM conversations c
         WHERE
           LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
           OR (
             LOWER(TRIM(COALESCE(c.status,''))) = 'requesting'
             AND TIMESTAMPDIFF(
                   HOUR,
                   (SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id),
                   NOW()
                 ) >= 24
           )
         ORDER BY last_message_time DESC`
      );
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const id = req.params.id;
    const { id: userId, role } = getCurrentUser(req);

    // Agents may only load messages for conversations assigned to them (so intervened by another agent is hidden)
    if (isAgentRole(role)) {
      const [convRows] = await db.query(
        "SELECT id, agent_id FROM conversations WHERE id = ?",
        [id]
      );
      if (!convRows || convRows.length === 0) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const convAgentId = convRows[0].agent_id != null ? Number(convRows[0].agent_id) : null;
      if (userId == null || convAgentId !== userId) {
        return res.status(403).json({ error: "You can only view messages for conversations assigned to you" });
      }
    }

    const [rows] = await db.query(
      "SELECT id, conversation_id, sender, message, created_at FROM message WHERE conversation_id = ? ORDER BY created_at ASC",
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.acceptChat = async (req, res) => {
  try {
    const id = req.params.id;
    const { id: agentId } = getCurrentUser(req);

    if (!agentId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: missing authenticated agent",
      });
    }

    await db.query(
      "UPDATE conversations SET status='active', agent_id=? WHERE id=?",
      [agentId, id]
    );

    res.json({ message: "Chat accepted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.interveneChat = async (req, res) => {
  try {
    const id = req.params.id;
    const { id: agentId } = getCurrentUser(req);
    if (agentId == null) {
      return res.status(401).json({ error: "Unauthorized: missing authenticated agent" });
    }
    const u = req.user || {};
    const agentName = (u.name || u.email || u.dataValues?.name || u.dataValues?.email) || "Agent";

    const [convRows] = await db.query(
      "SELECT id, phone FROM conversations WHERE id = ?",
      [id]
    );
    const phone = convRows && convRows[0] ? convRows[0].phone : null;

    // Set status to intervened AND assign to this agent so only they see it (other agents won't)
    await db.query(
      "UPDATE conversations SET status='intervened', agent_id=? WHERE id=?",
      [agentId, id]
    );

    try {
      socketService.emitToManager("intervention", {
        agentName,
        conversationId: parseInt(id, 10),
        phone,
        dateTime: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Socket emit intervention error:", e);
    }

    res.json({ message: "Human intervention started" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Intervene by phone (for admin/manager from inbox - find conversation by phone and set status to intervened)
exports.interveneByPhone = async (req, res) => {
  try {
    const phone = (req.body?.phone || req.query?.phone || "").toString().trim();
    if (!phone) {
      return res.status(400).json({ success: false, message: "phone is required" });
    }
    const [rows] = await db.query(
      "SELECT id FROM conversations WHERE phone = ? AND status != 'closed' ORDER BY id DESC LIMIT 1",
      [phone]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "No open conversation found for this phone" });
    }
    const id = rows[0].id;
    await db.query("UPDATE conversations SET status='intervened' WHERE id=?", [id]);
    res.json({ success: true, message: "Human intervention started" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    console.log("Chat sendMessage body:", req.body);

    const body = req.body || {};
    const { conversation_id, message } = body;

    if (!conversation_id || !message) {
      return res.status(400).json({
        success: false,
        error: "conversation_id and message are required",
      });
    }

    const { id: userId, role } = getCurrentUser(req);

    const [convRows] = await db.query(
      "SELECT id, agent_id, status, phone FROM conversations WHERE id = ?",
      [conversation_id]
    );
    if (!convRows || convRows.length === 0) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }

    const convAgentId = convRows[0].agent_id != null ? Number(convRows[0].agent_id) : null;
    const phone = convRows[0].phone;
    const convStatus = String(convRows[0].status || "").toLowerCase();

    if (isAgentRole(role)) {
      if (userId == null) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (convAgentId != null && convAgentId !== userId) {
        // After human intervention, allow sending even if agent_id is inconsistent.
        if (convStatus !== "intervened") {
          return res.status(403).json({
            success: false,
            error: "You can only send messages in conversations assigned to you",
          });
        }
      }
      if (convAgentId == null) {
        await db.query(
          "UPDATE conversations SET agent_id = ?, status = CASE WHEN LOWER(TRIM(COALESCE(status,''))) = 'requesting' THEN 'active' ELSE status END WHERE id = ?",
          [userId, conversation_id]
        );
      }
    }

    // Send actual text to WhatsApp (so "sent" is delivered, not only stored).
    // If WhatsApp sending fails, we still store the message in DB.
    try {
      if (phone && message) {
        await sendText(phone, message);
      }
    } catch (waErr) {
      console.error("WhatsApp sendText failed (chatController.sendMessage):", waErr?.message || waErr);
    }

    const [insertResult] = await db.query(
      "INSERT INTO message (conversation_id, sender, message) VALUES (?, 'agent', ?)",
      [conversation_id, message]
    );
    await db.query(
      "UPDATE conversations SET last_message = ? WHERE id = ?",
      [message, conversation_id]
    );

    const [messageRows] = await db.query(
      "SELECT id, conversation_id, sender, message, created_at FROM message WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );

    res.json({
      success: true,
      message: "Agent message sent",
      messages: messageRows || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Send approved template message from Live Chat/Intervene
// Expected body: { conversation_id, templateName, templateLanguage='en_US', templateParams=[], displayText }
exports.sendTemplateMessage = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      conversation_id,
      templateName,
      templateLanguage = "en_US",
      templateParams = [],
      displayText,
    } = body;

    if (!conversation_id || !templateName) {
      return res.status(400).json({
        success: false,
        error: "conversation_id and templateName are required",
      });
    }

    const { id: userId, role } = getCurrentUser(req);

    const [convRows] = await db.query(
      "SELECT id, agent_id, status, phone FROM conversations WHERE id = ?",
      [conversation_id]
    );

    if (!convRows || convRows.length === 0) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }

    const convAgentId = convRows[0].agent_id != null ? Number(convRows[0].agent_id) : null;
    const phone = convRows[0].phone;
    const convStatus = String(convRows[0].status || "").toLowerCase();

    if (isAgentRole(role)) {
      if (userId == null) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (convAgentId != null && convAgentId !== userId) {
        if (convStatus !== "intervened") {
          return res.status(403).json({
            success: false,
            error: "You can only send messages in conversations assigned to you",
          });
        }
      }
      if (convAgentId == null) {
        await db.query(
          "UPDATE conversations SET agent_id = ?, status = CASE WHEN LOWER(TRIM(COALESCE(status,''))) = 'requesting' THEN 'active' ELSE status END WHERE id = ?",
          [userId, conversation_id]
        );
      }
    }

    const textToStore = displayText || templateName;

    // Send approved template via WhatsApp template API
    try {
      if (phone) {
        // whatsappService.sendTemplate signature: (to, templateName, languageCode, parameters)
        await sendTemplate(phone, templateName, templateLanguage, templateParams);
      }
    } catch (waErr) {
      console.error("WhatsApp sendTemplate failed (chatController.sendTemplateMessage):", waErr?.message || waErr);
    }

    await db.query(
      "INSERT INTO message (conversation_id, sender, message) VALUES (?, 'agent', ?)",
      [conversation_id, textToStore]
    );
    await db.query("UPDATE conversations SET last_message = ? WHERE id = ?", [textToStore, conversation_id]);

    const [messageRows] = await db.query(
      "SELECT id, conversation_id, sender, message, created_at FROM message WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );

    res.json({
      success: true,
      message: "Agent template message sent",
      messages: messageRows || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.closeChat = async (req, res) => {
  try {
    const id = req.params.id;
    const { id: userId, role } = getCurrentUser(req);

    if (isAgentRole(role)) {
      const [convRows] = await db.query(
        "SELECT id, agent_id FROM conversations WHERE id = ?",
        [id]
      );
      if (!convRows || convRows.length === 0) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const convAgentId = convRows[0].agent_id != null ? Number(convRows[0].agent_id) : null;
      if (userId == null || convAgentId !== userId) {
        return res.status(403).json({ error: "You can only close conversations assigned to you" });
      }
    }

    await db.query(
      "UPDATE conversations SET status='closed' WHERE id=?",
      [id]
    );

    res.json({ message: "Chat closed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 3️⃣ MANAGER: assign chat to an agent explicitly
// Expects body: { conversationId, agentId }
exports.assignChat = async (req, res) => {
  try {
    const body = req.body || {};
    const conversationId = body.conversationId;
    const agentId = body.agentId;

    if (!conversationId || !agentId) {
      return res.status(400).json({
        success: false,
        message: "conversationId and agentId are required",
      });
    }

    // IMPORTANT: keep status='requesting' on assignment.
    // This way:
    // - Manager sees it first (unassigned requesting)
    // - After assignment it moves to agent's Requesting tab
    // - Only when agent clicks "Accept", status becomes 'active'
    await db.query(
      "UPDATE conversations SET agent_id = ?, status = 'requesting' WHERE id = ?",
      [agentId, conversationId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
