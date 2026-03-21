const db = require("../config/db");
const { sendText } = require("../services/whatsappService");

const chatListFields = `id,phone,customer_name,last_message,last_message_time,unread_count,status`;

exports.getActiveChats = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${chatListFields}
      FROM agent_conversations
      WHERE LOWER(COALESCE(status,'')) = 'active'
      ORDER BY last_message_time DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
};

exports.getRequestingChats = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${chatListFields}
      FROM agent_conversations
      WHERE LOWER(COALESCE(status,'')) = 'requesting'
      ORDER BY last_message_time DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
};

exports.getIntervenedChats = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${chatListFields}
      FROM agent_conversations
      WHERE LOWER(COALESCE(status,'')) = 'intervened'
      ORDER BY last_message_time DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const conversationId = req.params.id;
    const [rows] = await db.query(
      `SELECT sender,message,message_type,created_at
      FROM agent_messages
      WHERE conversation_id=?
      ORDER BY created_at ASC`,
      [conversationId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const body = req.body || {};
    const { conversation_id, phone, message } = body;

    if (conversation_id == null || !phone || message == null) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: conversation_id, phone, message",
      });
    }

    await sendText(phone, message);

    await db.query(
      `INSERT INTO agent_messages
      (conversation_id,sender,message,message_type,created_at)
      VALUES(?,?,?,?,NOW())`,
      [conversation_id, "agent", message, "text"]
    );

    await db.query(
      `UPDATE agent_conversations
      SET last_message=?,last_message_time=NOW(),unread_count=0
      WHERE id=?`,
      [message, conversation_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json(err);
  }
};
