const { Contact, Message, MetaMessage, InboxMessage, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendText } = require('../services/whatsappService');
const socketService = require('../services/socketService');
const { upsertConversationWithQuota } = require('../services/conversationBillingService');
const { requireProjectId } = require('../utils/projectScope');

const isAgentRole = (r) => (r || '').toString().toLowerCase() === 'agent';
const isProjectWideInboxRole = (r) => ['agent', 'admin', 'manager', 'super_admin'].includes((r || '').toString().toLowerCase());
const phoneVariants = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return [];
  const noPlus = raw.replace(/^\+/, '');
  return [...new Set([raw, noPlus, `+${noPlus}`])];
};

// Get inbox chat list - one row per contact with last message and unread count
// Includes contacts from Message table AND meta_messages table
// For agents (e.g. /campaign-reports history): return all contacts so they see same as admin inbox
exports.getInboxList = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const role = (req.user.role || '').toString().toLowerCase();
    const agentSeesAll = isProjectWideInboxRole(role);
    const contactTableName = Contact.tableName;
    const messageTableName = Message.tableName;
    const metaMessageTableName = MetaMessage.tableName;
    const inboxMessageTableName = InboxMessage.tableName;

    const userFilter = agentSeesAll ? '' : 'AND c.userId = :userId';
    const replacements = agentSeesAll ? { projectId } : { userId, projectId };

    const mmScoped = (alias) =>
      `(${alias}.projectId = :projectId OR (${alias}.projectId IS NULL AND EXISTS (SELECT 1 FROM \`${contactTableName}\` c_mm_sc WHERE c_mm_sc.phone = ${alias}.phone AND c_mm_sc.projectId = :projectId)))`;

    const inboxList = await sequelize.query(`
      SELECT DISTINCT
        c.id as contactId,
        c.phone,
        c.name,
        c.email,
        c.status as contactStatus,
        c.lastContacted,
        c.whatsappOptInAt,
        COALESCE(
          (SELECT m.content 
           FROM \`${messageTableName}\` m 
           WHERE m.contactId = c.id 
           ORDER BY m.sentAt DESC 
           LIMIT 1),
          (SELECT im.message
           FROM \`${inboxMessageTableName}\` im
           WHERE im.contactId = c.id
             AND im.projectId = :projectId
           ORDER BY im.timestamp DESC
           LIMIT 1),
          (SELECT mm.message_text 
           FROM \`${metaMessageTableName}\` mm 
           WHERE mm.phone = c.phone 
             AND ${mmScoped('mm')}
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
          (SELECT im.timestamp
           FROM \`${inboxMessageTableName}\` im
           WHERE im.contactId = c.id
             AND im.projectId = :projectId
           ORDER BY im.timestamp DESC
           LIMIT 1),
          (SELECT mm.created_at 
           FROM \`${metaMessageTableName}\` mm 
           WHERE mm.phone = c.phone 
             AND ${mmScoped('mm')}
           ORDER BY mm.created_at DESC 
           LIMIT 1)
        ) as lastMessageTime,
        (
          SELECT COUNT(*) 
          FROM \`${messageTableName}\` m 
          WHERE m.contactId = c.id 
            AND m.type = 'incoming' 
            AND m.status != 'read'
        ) + (
          SELECT COUNT(*)
          FROM \`${inboxMessageTableName}\` im
          WHERE im.contactId = c.id
            AND im.projectId = :projectId
            AND im.direction = 'incoming'
            AND im.status != 'read'
        ) as unreadCount,
        (
          SELECT conv.status
          FROM conversations conv
          WHERE conv.phone = c.phone
            AND conv.status != 'closed'
          ORDER BY conv.id DESC
          LIMIT 1
        ) as chatStatus
      FROM \`${contactTableName}\` c
      WHERE 1=1 ${userFilter}
        AND (
          c.projectId = :projectId
          OR EXISTS (
            SELECT 1
            FROM \`${inboxMessageTableName}\` im_scope
            WHERE im_scope.contactId = c.id
              AND im_scope.projectId = :projectId
          )
        )
        AND (
          EXISTS (
            SELECT 1 
            FROM \`${messageTableName}\` m 
            WHERE m.contactId = c.id
          )
          OR EXISTS (
            SELECT 1
            FROM \`${inboxMessageTableName}\` im
            WHERE im.contactId = c.id
              AND im.projectId = :projectId
          )
          OR EXISTS (
            SELECT 1 
            FROM \`${metaMessageTableName}\` mm 
            WHERE mm.phone = c.phone
              AND ${mmScoped('mm')}
          )
        )
      ORDER BY lastMessageTime DESC
    `, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const metaMessagesContacts = await sequelize.query(`
      SELECT DISTINCT
        NULL as contactId,
        mm.phone,
        mm.phone as name,
        NULL as email,
        'active' as contactStatus,
        MAX(mm.created_at) as lastContacted,
        NULL as whatsappOptInAt,
        (SELECT mm2.message_text 
         FROM \`${metaMessageTableName}\` mm2 
         WHERE mm2.phone = mm.phone 
           AND ${mmScoped('mm2')}
         ORDER BY mm2.created_at DESC 
         LIMIT 1) as lastMessage,
        MAX(mm.created_at) as lastMessageTime,
        0 as unreadCount,
        (
          SELECT conv.status
          FROM conversations conv
          WHERE conv.phone = mm.phone
            AND conv.status != 'closed'
          ORDER BY conv.id DESC
          LIMIT 1
        ) as chatStatus
      FROM \`${metaMessageTableName}\` mm
      ${agentSeesAll ? 'WHERE EXISTS (SELECT 1 FROM `' + contactTableName + '` c2 WHERE c2.phone = mm.phone AND c2.projectId = :projectId) AND (' + mmScoped('mm') + ')' : 'WHERE NOT EXISTS (SELECT 1 FROM `' + contactTableName + '` c2 WHERE c2.phone = mm.phone AND c2.userId = :userId AND c2.projectId = :projectId) AND EXISTS (SELECT 1 FROM `' + contactTableName + '` c3 WHERE c3.phone = mm.phone AND c3.projectId = :projectId) AND (' + mmScoped('mm') + ')'}
      GROUP BY mm.phone
      ORDER BY lastMessageTime DESC
    `, {
      replacements,
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
      whatsappOptInAt: item.whatsappOptInAt || null,
      lastMessage: item.lastMessage || '',
      lastMessageTime: item.lastMessageTime,
      unreadCount: parseInt(item.unreadCount) || 0,
      chatStatus: item.chatStatus || null,
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
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const role = (req.user.role || '').toString().toLowerCase();
    const agentSeesAll = isProjectWideInboxRole(role);
    // Decode phone number - handle both encoded and non-encoded formats
    let phone = req.params.phone;
    try {
      phone = decodeURIComponent(phone);
    } catch (e) {
      phone = req.params.phone;
    }
    phone = phone.replace(/%2B/g, '+');
    const variants = phoneVariants(phone);
    const normalizedPhone = variants[0] || phone;

    let contactWhere = agentSeesAll
      ? { phone: { [Op.in]: variants }, projectId }
      : { phone: { [Op.in]: variants }, userId, projectId };
    let contact = await Contact.findOne({ where: contactWhere });

    // Fallback: contact may have null/old projectId while messages are correctly project-scoped.
    if (!contact) {
      contactWhere = agentSeesAll ? { phone: { [Op.in]: variants } } : { phone: { [Op.in]: variants }, userId };
      contact = await Contact.findOne({ where: contactWhere });
      if (contact) {
        const hasProjectScopedInboxMessages = await InboxMessage.count({
          where: {
            contactId: contact.id,
            projectId
          }
        });
        if (!hasProjectScopedInboxMessages) {
          contact = null;
        }
      }
    }

    if (!contact) {
      // Project may have only meta/webhook rows initially (no Contact yet).
      // Return synthetic contact so frontend can continue loading meta messages without 404.
      const hasScopedMetaMessages = await MetaMessage.count({
        where: {
          phone: { [Op.in]: variants },
          [Op.or]: [
            { projectId },
            { projectId: null }
          ]
        }
      });
      if (hasScopedMetaMessages > 0) {
        return res.json({
          success: true,
          contact: {
            id: null,
            phone: normalizedPhone,
            name: normalizedPhone,
            email: null,
            status: 'active',
            whatsappOptInAt: null
          },
          messages: []
        });
      }
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

    const inboxMessageWhere = agentSeesAll
      ? { contactId: contact.id, projectId }
      : { contactId: contact.id, userId, projectId };
    const inboxMessages = await InboxMessage.findAll({
      where: inboxMessageWhere,
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
        status: contact.status,
        whatsappOptInAt: contact.whatsappOptInAt || null
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
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
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
    const variants = phoneVariants(normalizedPhone);

    // 1️⃣ Ensure contact exists - phone has unique constraint, so find by phone first
    // Then update userId if different (contact might exist for different user)
    let contact = await Contact.findOne({
      where: { phone: { [Op.in]: variants }, projectId }
    });

    // Legacy: one row per (userId, phone) with projectId unset — attach to this project once.
    if (!contact) {
      contact = await Contact.findOne({
        where: { phone: { [Op.in]: variants }, userId, projectId: null }
      });
      if (contact) {
        await contact.update({ projectId });
        await contact.reload();
        console.log('✅ Migrated legacy contact to project (ID:', contact.id + ')');
      }
    }

    if (!contact) {
      try {
        contact = await Contact.create({
          userId: userId,
          projectId,
          phone: normalizedPhone,
          name: normalizedPhone,
          status: 'active'
        });
        console.log('✅ Created new contact (ID:', contact.id + ')');
      } catch (createErr) {
        // Race-safe fallback for duplicate create attempts.
        if (createErr?.name === 'SequelizeUniqueConstraintError' || /Validation error/i.test(createErr?.message || '')) {
          contact = await Contact.findOne({
            where: { phone: { [Op.in]: variants }, projectId }
          });
        }
        if (!contact) throw createErr;
      }
    } else {
      console.log('✅ Contact found (ID:', contact.id + ')');
    }

    // Enforce opt-in/out before sending
    const isOptedIn =
      contact.status !== 'unsubscribed' &&
      !!contact.whatsappOptInAt;

    if (!isOptedIn) {
      const message = await Message.create({
        contactId: contact.id,
        projectId,
        content: messageText,
        type: 'outgoing',
        status: 'failed',
        errorMessage: 'Blocked (opt-out / not opted-in)',
        sentAt: new Date()
      });

      // Also save to InboxMessage so UI shows the attempt
      let inboxMessage = null;
      try {
        inboxMessage = await InboxMessage.create({
          contactId: contact.id,
          userId,
          projectId,
          direction: 'outgoing',
          message: messageText,
          type: 'text',
          status: 'failed',
          timestamp: new Date()
        });
      } catch (inboxError) {
        console.error('Error saving blocked InboxMessage:', inboxError);
      }

      await contact.update({
        lastContacted: new Date()
      });

      // Emit socket events for real-time UI
      try {
        const messageData = {
          id: inboxMessage?.id || message.id,
          contactId: contact.id,
          phone: normalizedPhone,
          content: messageText,
          type: 'outgoing',
          status: message.status,
          sentAt: message.sentAt ? message.sentAt.toISOString() : new Date().toISOString(),
          createdAt: message.createdAt ? message.createdAt.toISOString() : new Date().toISOString(),
          waMessageId: inboxMessage?.waMessageId || null
        };
        socketService.emitToContact(contact.id, 'new-message', messageData);
        socketService.emitToUser(userId, 'inbox-update', { contactId: contact.id });
      } catch (socketError) {
        console.error('Error emitting socket (blocked message):', socketError);
      }

      return res.json({
        success: true,
        message: {
          id: message.id,
          content: message.content,
          status: message.status,
          type: message.type,
          sentAt: message.sentAt,
          contactId: contact.id,
          waMessageId: inboxMessage?.waMessageId || null,
          is24hWindow: false,
          messageType: 'text'
        }
      });
    }

    // 2️⃣ Save message first (will update with waMessageId after API call)
    const message = await Message.create({
      contactId: contact.id,
      projectId,
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
        projectId,
        direction: 'outgoing',
        message: messageText,
        type: 'text',
        status: 'sent', // Will be updated based on API result
        timestamp: new Date()
      });
    } catch (inboxError) {
      console.error('Error saving to InboxMessage:', inboxError);
    }

    // 3️⃣ Send exact user message text (same behavior as /live-chat).
    // Never replace user content with default template fallback.
    let sendResult = null;
    let apiError = null;

    try {
      // Conversation billing/quota enforcement (24-hour rolling).
      const billing = await upsertConversationWithQuota(userId, normalizedPhone);
      if (!billing.allowed) {
        const errorMessage = 'Blocked (conversation limit reached)';

        // Mark attempt as failed in both tables so UI reflects it.
        await message.update({ status: 'failed', errorMessage });
        if (inboxMessage) {
          await inboxMessage.update({ status: 'failed' });
        }

        // Update contact lastContacted (keeps existing UX consistent)
        await contact.update({ lastContacted: new Date() });

        // Emit socket events for real-time UI (same as success path)
        try {
          const messageData = {
            id: inboxMessage?.id || message.id,
            contactId: contact.id,
            phone: normalizedPhone,
            content: messageText,
            type: 'outgoing',
            status: 'failed',
            sentAt: message.sentAt ? message.sentAt.toISOString() : new Date().toISOString(),
            createdAt: message.createdAt ? message.createdAt.toISOString() : new Date().toISOString(),
            waMessageId: null,
          };
          socketService.emitToContact(contact.id, 'new-message', messageData);
          socketService.emitToUser(userId, 'inbox-update', { contactId: contact.id });
        } catch (socketError) {
          console.error('Error emitting socket (blocked by quota):', socketError);
        }

        return res.status(200).json({
          success: true,
          message: {
            id: message.id,
            content: message.content,
            status: 'failed',
            type: message.type,
            sentAt: message.sentAt,
            contactId: contact.id,
            waMessageId: null,
            messageType: 'text',
          }
        });
      }

      sendResult = await sendText(normalizedPhone, messageText);

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

    // 4️⃣ Update contact's lastContacted
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
        messageType: 'text'
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
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const role = (req.user.role || '').toString().toLowerCase();
    const projectWide = isProjectWideInboxRole(role);
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

    const variants = phoneVariants(phone);
    // Find all matching contacts by phone+project (legacy duplicates can exist).
    const contacts = await Contact.findAll({
      where: {
        phone: { [Op.in]: variants },
        ...(projectWide ? {} : { userId }),
        projectId
      }
    });

    if (!contacts || contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    const contactIds = contacts.map((c) => c.id);

    // Update all incoming Message rows that are not read
    const [updatedMessageCount] = await Message.update(
      {
        status: 'read',
        readAt: new Date()
      },
      {
        where: {
          contactId: { [Op.in]: contactIds },
          type: 'incoming',
          status: {
            [Op.ne]: 'read'
          }
        }
      }
    );

    // Update all incoming InboxMessage rows that are not read
    const [updatedInboxMessageCount] = await InboxMessage.update(
      {
        status: 'read'
      },
      {
        where: {
          contactId: { [Op.in]: contactIds },
          projectId,
          direction: 'incoming',
          status: {
            [Op.ne]: 'read'
          }
        }
      }
    );

    const updatedCount = (Number(updatedMessageCount) || 0) + (Number(updatedInboxMessageCount) || 0);

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

