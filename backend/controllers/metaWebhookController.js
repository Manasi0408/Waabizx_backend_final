const { WebhookLog, MetaMessage, Contact, Message, User } = require('../models');
const { Op } = require('sequelize');
const socketService = require('../services/socketService');

exports.handleWebhook = async (req, res) => {
  try {
    const payload = req.body;

    // 🔹 1. Save raw webhook (for debugging & audit)
    await WebhookLog.create({
      event_type: payload.event || 'unknown',
      payload: JSON.stringify(payload)
    });

    // 🔹 2. Process incoming message
    if (payload.event === 'message_received') {
      const phone = payload.from;
      const text = payload?.message?.text || '';

      if (phone) {
        // Save to MetaMessage for webhook tracking
        await MetaMessage.create({
          phone,
          direction: 'inbound',
          message_type: 'text',
          message_text: text,
          status: 'received'
        });

        // 🔹 3. Find or create contact (associate with first active user for now)
        // In production, you might want to use company_id or account_id from webhook payload
        const firstUser = await User.findOne({
          where: { status: 'active' },
          order: [['id', 'ASC']]
        });

        if (firstUser) {
          let contact = await Contact.findOne({
            where: {
              phone,
              userId: firstUser.id
            }
          });

          // Create contact if doesn't exist
          if (!contact) {
            contact = await Contact.create({
              userId: firstUser.id,
              phone,
              name: phone, // Default name to phone number
              status: 'active'
            });
          }

          // 🔹 4. Save message to Message table (for inbox)
          const newMessage = await Message.create({
            contactId: contact.id,
            content: text,
            type: 'incoming',
            status: 'delivered', // Incoming messages are considered delivered
            sentAt: new Date(),
            deliveredAt: new Date(),
            mediaType: payload?.message?.type || 'text',
            mediaUrl: payload?.message?.image?.url || payload?.message?.video?.url || payload?.message?.audio?.url || payload?.message?.document?.url || null
          });

          // 🔹 5. Update contact's lastContacted
          await contact.update({
            lastContacted: new Date()
          });

          // 🔹 6. Emit real-time update via Socket.IO
          socketService.emitToContact(contact.id, 'new-message', newMessage);
          socketService.emitToUser(firstUser.id, 'inbox-update', {
            contactId: contact.id,
            lastMessage: text,
            lastMessageTime: new Date()
          });
        }
      }
    }

    // 🔹 3. Handle message status updates (delivered, read)
    if (payload.event === 'message_delivered' || payload.event === 'message_read') {
      const messageId = payload.message_id || payload.id;
      const phone = payload.to || payload.recipient;

      if (phone && messageId) {
        // Find contact
        const firstUser = await User.findOne({
          where: { status: 'active' },
          order: [['id', 'ASC']]
        });

        if (firstUser) {
          const contact = await Contact.findOne({
            where: { phone, userId: firstUser.id }
          });

          if (contact) {
            // Find message by external ID or phone + content match
            const message = await Message.findOne({
              where: {
                contactId: contact.id,
                type: 'outgoing',
                status: payload.event === 'message_delivered' ? 'sent' : { [Op.in]: ['sent', 'delivered'] }
              },
              order: [['sentAt', 'DESC']],
              limit: 1
            });

            if (message) {
              const updateData = {};
              if (payload.event === 'message_delivered') {
                updateData.status = 'delivered';
                updateData.deliveredAt = new Date();
              } else if (payload.event === 'message_read') {
                updateData.status = 'read';
                updateData.readAt = new Date();
              }

              await message.update(updateData);

              // Emit status update via Socket.IO
              socketService.emitToContact(contact.id, 'message-status-update', {
                messageId: message.id,
                status: updateData.status,
                deliveredAt: updateData.deliveredAt,
                readAt: updateData.readAt
              });
            }
          }
        }
      }
    }

    // 🔹 Always respond 200 to webhook
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('AISENSY WEBHOOK ERROR:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get webhook logs (for debugging)
exports.getWebhookLogs = async (req, res) => {
  try {
    const { limit = 50, event_type } = req.query;

    const where = {};
    if (event_type) {
      where.event_type = event_type;
    }

    // Use a very high limit or no limit if limit is very high
    const queryLimit = parseInt(limit) >= 1000 ? null : parseInt(limit);
    const logs = await WebhookLog.findAll({
      where,
      limit: queryLimit, // null means no limit
      order: [['created_at', 'DESC']],
      attributes: ['id', 'event_type', 'payload', 'created_at']
    });

    res.json({
      success: true,
      count: logs.length,
      logs: logs.map(log => ({
        id: log.id,
        event_type: log.event_type,
        payload: JSON.parse(log.payload),
        received_at: log.created_at
      }))
    });
  } catch (err) {
    console.error('Get Webhook Logs Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get webhook logs'
    });
  }
};