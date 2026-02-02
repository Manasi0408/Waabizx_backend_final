const { Contact, Message, MetaMessage, InboxMessage, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendText, sendTemplate } = require('../services/whatsappService');
const socketService = require('../services/socketService');

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

    // Get all messages for this contact from Message table
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

    // Also get messages from InboxMessage table (includes template messages)
    const inboxMessages = await InboxMessage.findAll({
      where: {
        contactId: contact.id,
        userId: userId
      },
      order: [['timestamp', 'ASC']],
      attributes: [
        'id',
        'message',
        'status',
        'direction',
        'type',
        'timestamp',
        'waMessageId',
        'createdAt',
        'updatedAt'
      ]
    });

    // Convert InboxMessage to same format as Message
    const convertedInboxMessages = inboxMessages.map(im => ({
      id: im.id,
      content: im.message, // InboxMessage uses 'message' field
      status: im.status,
      type: im.direction === 'incoming' ? 'incoming' : 'outgoing',
      sentAt: im.timestamp || im.createdAt,
      deliveredAt: null,
      readAt: null,
      createdAt: im.createdAt,
      updatedAt: im.updatedAt,
      waMessageId: im.waMessageId,
      source: 'inbox_message',
      isTemplate: im.message?.startsWith('Template:') || false
    }));

    // Merge and deduplicate messages
    const allMessages = [...messages, ...convertedInboxMessages];
    
    // Remove duplicates by ID and sort by sentAt
    const uniqueMessages = allMessages.reduce((acc, msg) => {
      const existing = acc.find(m => m.id === msg.id);
      if (!existing) {
        acc.push(msg);
      }
      return acc;
    }, []);

    // Sort by sentAt/timestamp
    uniqueMessages.sort((a, b) => {
      const dateA = new Date(a.sentAt || a.createdAt || 0);
      const dateB = new Date(b.sentAt || b.createdAt || 0);
      return dateA - dateB;
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
      messages: uniqueMessages
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
    const { phone, message: text } = req.body; // Accept both 'phone' and 'to', 'message' and 'text'

    // Support multiple field names for compatibility
    const to = phone || req.body.to || req.body.phone;
    const messageText = text || req.body.message || req.body.text;

    if (!to || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Phone and message are required'
      });
    }

    // Normalize phone number (remove spaces, dashes, but keep country code)
    const normalizedPhone = to.toString().trim().replace(/[\s\-\(\)]/g, '');

    // 1️⃣ Ensure contact exists - phone has unique constraint, so find by phone first
    // Then update userId if different (contact might exist for different user)
    let contact = await Contact.findOne({
      where: { phone: normalizedPhone }
    });

    if (!contact) {
      // Contact doesn't exist, create new one
      contact = await Contact.create({
        userId: userId,
        phone: normalizedPhone,
        name: normalizedPhone, // Default name to phone number
        status: 'active'
      });
      console.log('✅ Created new contact (ID:', contact.id + ')');
    } else {
      // Contact exists - update userId if different (in case phone was shared across users)
      const oldUserId = contact.userId;
      if (contact.userId !== userId) {
        await contact.update({ userId: userId });
        // Reload contact to get updated data
        await contact.reload();
        console.log('✅ Updated contact userId (ID:', contact.id + ', old userId:', oldUserId + ', new userId:', userId + ')');
      } else {
        console.log('✅ Contact found (ID:', contact.id + ')');
      }
    }

    // 2️⃣ Check 24-hour window - Look for last inbound message from this contact
    const lastInbound = await InboxMessage.findOne({
      where: {
        contactId: contact.id,
        direction: 'incoming'
      },
      order: [['timestamp', 'DESC']]
    });

    // Calculate if 24-hour window is open
    const is24hOpen = lastInbound && 
      (Date.now() - new Date(lastInbound.timestamp).getTime() < 24 * 60 * 60 * 1000);

    console.log('📅 24-hour window check:', {
      hasLastInbound: !!lastInbound,
      lastInboundTime: lastInbound?.timestamp,
      is24hOpen,
      hoursSinceLastMessage: lastInbound 
        ? Math.round((Date.now() - new Date(lastInbound.timestamp).getTime()) / (60 * 60 * 1000) * 10) / 10 
        : null
    });

    // 3️⃣ Save message first (will update with waMessageId after API call)
    const message = await Message.create({
      contactId: contact.id,
      content: messageText,
      type: 'outgoing',
      status: 'sent', // Will be updated based on API result
      sentAt: new Date()
    });

    // Also save to InboxMessage
    let inboxMessage = null;
    try {
      inboxMessage = await InboxMessage.create({
        contactId: contact.id,
        userId,
        direction: 'outgoing',
        message: messageText,
        type: 'text',
        status: 'sent', // Will be updated based on API result
        timestamp: new Date()
      });
    } catch (inboxError) {
      console.error('Error saving to InboxMessage:', inboxError);
    }

    // 4️⃣ Send via Meta Cloud API based on 24-hour window
    let sendResult = null;
    let apiError = null;
    let messageSent = false;

    try {
      if (is24hOpen) {
        // ✅ CASE 1: 24-Hour Window OPEN - Send TEXT message
        console.log('🟢 24-hour window OPEN - Sending TEXT message via Meta API');
        sendResult = await sendText(normalizedPhone, messageText);
        messageSent = true;
      } else {
        // ❌ CASE 2: 24-Hour Window CLOSED - Send TEMPLATE message
        // Default template name - can be configured via env or passed in request
        const templateName = req.body.templateName || process.env.DEFAULT_TEMPLATE_NAME || 'hello_world';
        const templateLanguage = req.body.templateLanguage || 'en_US';
        
        console.log('🔴 24-hour window CLOSED - Sending TEMPLATE message via Meta API:', {
          templateName,
          templateLanguage,
          note: 'User message will be ignored, template will be sent instead'
        });
        
        sendResult = await sendTemplate(normalizedPhone, templateName, templateLanguage);
        messageSent = true;
        
        // Note: The actual template is sent, not the user's message
        // You might want to log this or handle it differently
      }

      if (sendResult && sendResult.success) {
        console.log('✅ Meta API call successful:', {
          messageId: sendResult.messageId,
          wamid: sendResult.wamid
        });

        // Update messages with WhatsApp message ID
        await message.update({
          status: 'sent',
          errorMessage: null
        });

        if (inboxMessage) {
          await inboxMessage.update({ 
            status: 'sent',
            waMessageId: sendResult.wamid || sendResult.messageId
          });
        }
      }
    } catch (sendError) {
      apiError = sendError;
      console.error('❌ Error sending message via Meta API:', sendError.message || sendError);
      
      // Update message status to failed
      const errorMessage = sendError.message || 'Failed to send via Meta API';
      await message.update({
        status: 'failed',
        errorMessage: errorMessage
      });
      
      if (inboxMessage) {
        await inboxMessage.update({ 
          status: 'failed'
        });
      }
    }

    // 5️⃣ Update contact's lastContacted
    await contact.update({
      lastContacted: new Date()
    });

    // Emit socket event for real-time updates
    try {
      const messageData = {
        id: inboxMessage?.id || message.id,
        contactId: contact.id,
        phone: normalizedPhone,
        content: messageText, // Use text content
        type: 'outgoing',
        status: message.status,
        sentAt: message.sentAt ? message.sentAt.toISOString() : new Date().toISOString(),
        createdAt: message.createdAt ? message.createdAt.toISOString() : new Date().toISOString(),
        waMessageId: inboxMessage?.waMessageId || sendResult?.wamid
      };
      console.log('📡 Emitting new-message socket event from inbox:', messageData);
      socketService.emitToContact(contact.id, 'new-message', messageData);
      socketService.emitToUser(userId, 'inbox-update', { contactId: contact.id });
    } catch (socketError) {
      console.error('Error emitting socket:', socketError);
      // Don't fail the request if this fails
    }

    // Return response
    if (apiError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: apiError.message,
        messageRecord: {
          id: message.id,
          content: message.content,
          status: message.status,
          type: message.type
        }
      });
    }

    res.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        status: message.status,
        type: message.type,
        sentAt: message.sentAt,
        contactId: contact.id,
        waMessageId: inboxMessage?.waMessageId || sendResult?.wamid,
        is24hWindow: is24hOpen,
        messageType: is24hOpen ? 'text' : 'template'
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

