const { Contact, Message, MetaMessage, sequelize } = require('../models');
const { Op } = require('sequelize');
const aisensyService = require('../services/aisensyService');

// Get inbox chat list - one row per contact with last message and unread count
// Includes contacts from Message table AND meta_messages table
exports.getInboxList = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactTableName = Contact.tableName;
    const messageTableName = Message.tableName;
    const metaMessageTableName = MetaMessage.tableName;

    // Get all contacts that have messages in Message table OR meta_messages table
    const inboxList = await sequelize.query(`
      SELECT DISTINCT
        c.id as contactId,
        c.phone,
        c.name,
        c.email,
        c.status as contactStatus,
        c.lastContacted,
        COALESCE(
          (SELECT m.content 
           FROM \`${messageTableName}\` m 
           WHERE m.contactId = c.id 
           ORDER BY m.sentAt DESC 
           LIMIT 1),
          (SELECT mm.message_text 
           FROM \`${metaMessageTableName}\` mm 
           WHERE mm.phone = c.phone 
           ORDER BY mm.created_at DESC 
           LIMIT 1),
          ''
        ) as lastMessage,
        COALESCE(
          (SELECT m.sentAt 
           FROM \`${messageTableName}\` m 
           WHERE m.contactId = c.id 
           ORDER BY m.sentAt DESC 
           LIMIT 1),
          (SELECT mm.created_at 
           FROM \`${metaMessageTableName}\` mm 
           WHERE mm.phone = c.phone 
           ORDER BY mm.created_at DESC 
           LIMIT 1)
        ) as lastMessageTime,
        (
          SELECT COUNT(*) 
          FROM \`${messageTableName}\` m 
          WHERE m.contactId = c.id 
            AND m.type = 'incoming' 
            AND m.status != 'read'
        ) as unreadCount
      FROM \`${contactTableName}\` c
      WHERE c.userId = :userId
        AND (
          EXISTS (
            SELECT 1 
            FROM \`${messageTableName}\` m 
            WHERE m.contactId = c.id
          )
          OR EXISTS (
            SELECT 1 
            FROM \`${metaMessageTableName}\` mm 
            WHERE mm.phone = c.phone
          )
        )
      ORDER BY lastMessageTime DESC
    `, {
      replacements: { userId },
      type: sequelize.QueryTypes.SELECT
    });

    // Also get contacts from meta_messages that don't have a Contact record yet
    const metaMessagesContacts = await sequelize.query(`
      SELECT DISTINCT
        NULL as contactId,
        mm.phone,
        mm.phone as name,
        NULL as email,
        'active' as contactStatus,
        MAX(mm.created_at) as lastContacted,
        (SELECT mm2.message_text 
         FROM \`${metaMessageTableName}\` mm2 
         WHERE mm2.phone = mm.phone 
         ORDER BY mm2.created_at DESC 
         LIMIT 1) as lastMessage,
        MAX(mm.created_at) as lastMessageTime,
        0 as unreadCount
      FROM \`${metaMessageTableName}\` mm
      WHERE NOT EXISTS (
        SELECT 1 
        FROM \`${contactTableName}\` c 
        WHERE c.phone = mm.phone AND c.userId = :userId
      )
      GROUP BY mm.phone
      ORDER BY lastMessageTime DESC
    `, {
      replacements: { userId },
      type: sequelize.QueryTypes.SELECT
    });

    // Combine both lists
    const allContacts = [...inboxList, ...metaMessagesContacts];

    // Format the response
    const formattedList = allContacts.map(item => ({
      contactId: item.contactId,
      phone: item.phone,
      name: item.name || item.phone,
      email: item.email,
      status: item.contactStatus,
      lastContacted: item.lastContacted,
      lastMessage: item.lastMessage || '',
      lastMessageTime: item.lastMessageTime,
      unreadCount: parseInt(item.unreadCount) || 0
    }));

    // Remove duplicates by phone (keep the one with contactId if available)
    const uniqueContacts = [];
    const seenPhones = new Set();
    for (const contact of formattedList) {
      if (!seenPhones.has(contact.phone)) {
        seenPhones.add(contact.phone);
        uniqueContacts.push(contact);
      }
    }

    // Sort by lastMessageTime
    uniqueContacts.sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return timeB - timeA;
    });

    res.json({
      success: true,
      inbox: uniqueContacts
    });
  } catch (error) {
    console.error('Error fetching inbox list:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get messages of a specific contact by phone
exports.getContactMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    // Decode phone number - handle both encoded and non-encoded formats
    let phone = req.params.phone;
    try {
      // Try decoding (in case it's encoded)
      phone = decodeURIComponent(phone);
    } catch (e) {
      // If decoding fails, use as-is
      phone = req.params.phone;
    }
    // Also handle %2B which is encoded +
    phone = phone.replace(/%2B/g, '+');

    // Find contact by phone and userId
    const contact = await Contact.findOne({
      where: {
        phone,
        userId
      }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Get all messages for this contact
    const messages = await Message.findAll({
      where: {
        contactId: contact.id
      },
      order: [['sentAt', 'ASC']],
      attributes: [
        'id',
        'content',
        'status',
        'type',
        'sentAt',
        'deliveredAt',
        'readAt',
        'createdAt',
        'updatedAt'
      ]
    });

    res.json({
      success: true,
      contact: {
        id: contact.id,
        phone: contact.phone,
        name: contact.name,
        email: contact.email,
        status: contact.status
      },
      messages: messages
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Send message from inbox
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, text } = req.body;

    if (!phone || !text) {
      return res.status(400).json({
        success: false,
        message: 'Phone and text are required'
      });
    }

    // Find or create contact
    let contact = await Contact.findOne({
      where: {
        phone,
        userId
      }
    });

    if (!contact) {
      // Create contact if doesn't exist
      contact = await Contact.create({
        userId,
        phone,
        name: phone, // Default name to phone number
        status: 'active'
      });
    }

    // Send message via AiSensy service
    let sendResult;
    try {
      sendResult = await aisensyService.sendTextMessage({ phone, text });
    } catch (sendError) {
      console.error('Error sending message via AiSensy:', sendError);
      // Still save the message even if sending fails
    }

    // Save message to database
    const message = await Message.create({
      contactId: contact.id,
      content: text,
      type: 'outgoing',
      status: sendResult ? 'sent' : 'failed',
      sentAt: new Date(),
      errorMessage: sendResult ? null : 'Failed to send via AiSensy service'
    });

    // Update contact's lastContacted
    await contact.update({
      lastContacted: new Date()
    });

    res.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        status: message.status,
        type: message.type,
        sentAt: message.sentAt,
        contactId: contact.id
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark messages as read for a contact
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    // Decode phone number - handle both encoded and non-encoded formats
    let phone = req.params.phone;
    try {
      // Try decoding (in case it's encoded)
      phone = decodeURIComponent(phone);
    } catch (e) {
      // If decoding fails, use as-is
      phone = req.params.phone;
    }
    // Also handle %2B which is encoded +
    phone = phone.replace(/%2B/g, '+');

    // Find contact by phone and userId
    const contact = await Contact.findOne({
      where: {
        phone,
        userId
      }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Update all incoming messages that are not read
    const [updatedCount] = await Message.update(
      {
        status: 'read',
        readAt: new Date()
      },
      {
        where: {
          contactId: contact.id,
          type: 'incoming',
          status: {
            [Op.ne]: 'read'
          }
        }
      }
    );

    res.json({
      success: true,
      message: `Marked ${updatedCount} messages as read`,
      updatedCount
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

