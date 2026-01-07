const aisensyService = require('../services/aisensyService');
const { MetaMessage, Message, Contact, User } = require('../models');
const { Op } = require('sequelize');

// Check WhatsApp API key connection
exports.checkApiKey = async (req, res) => {
  try {
    const result = await aisensyService.checkApiKeyConnection();
    
    if (result.connected) {
      res.status(200).json({
        success: true,
        ...result
      });
    } else {
      res.status(400).json({
        success: false,
        ...result
      });
    }
  } catch (err) {
    console.error('Check API Key Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to check API key connection'
    });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { phone, text, template, type } = req.body;

    // Phone is always required
    if (!phone) {
      return res.json({ 
        success: false, 
        error: 'Phone is required' 
      });
    }

    // Validation based on message type
    if (type === 'template') {
      // For template messages: template name and language code are required
      if (!template?.name || !template?.language?.code) {
        return res.json({ 
          success: false, 
          error: 'Template name and language required' 
        });
      }
    } else {
      // For text messages (or default): text is required
      if (!text) {
        return res.json({ 
          success: false, 
          error: 'Text is required' 
        });
      }
    }

    // Determine message text for database storage
    let messageText = text;
    if (type === 'template' && template) {
      messageText = `Template: ${template.name || 'N/A'}`;
    }

    // Send message with all data (try to send to WhatsApp)
    let result = null;
    let sendStatus = 'sent';
    try {
      result = await aisensyService.sendMessage({ 
        phone, 
        text, 
        type: type || 'text',
        template
      });
    } catch (sendError) {
      console.error('Error sending message via AiSensy:', sendError);
      sendStatus = 'failed';
      // Continue to save message even if WhatsApp send fails
    }

    // Save to MetaMessage table (always save, even if WhatsApp send failed)
    await MetaMessage.create({
      phone,
      direction: 'outbound',
      message_type: type || 'text',
      message_text: messageText || '',
      status: sendStatus
    });

    // Also save to Message table so it appears in inbox
    // Use the authenticated user from req.user (if available)
    const userId = req.user?.id;
    
    if (userId) {
      // Find or create contact for the authenticated user
      let contact = await Contact.findOne({
        where: {
          phone,
          userId: userId
        }
      });

      if (!contact) {
        contact = await Contact.create({
          userId: userId,
          phone,
          name: phone, // Default name to phone number
          status: 'active'
        });
      }

      // Save message to Message table for inbox
      await Message.create({
        contactId: contact.id,
        content: messageText || '',
        type: 'outgoing',
        status: sendStatus, // Use the actual send status
        sentAt: new Date()
      });

      // Update contact's lastContacted
      await contact.update({
        lastContacted: new Date()
      });
    } else {
      // Fallback: If no authenticated user, try to find first active user (for backward compatibility)
      const firstUser = await User.findOne({
        where: { status: 'active' },
        order: [['id', 'ASC']]
      });

      if (firstUser) {
        // Find or create contact
        let contact = await Contact.findOne({
          where: {
            phone,
            userId: firstUser.id
          }
        });

        if (!contact) {
          contact = await Contact.create({
            userId: firstUser.id,
            phone,
            name: phone,
            status: 'active'
          });
        }

        // Save message to Message table for inbox
        await Message.create({
          contactId: contact.id,
          content: messageText || '',
          type: 'outgoing',
          status: sendStatus, // Use the actual send status
          sentAt: new Date()
        });

        // Update contact's lastContacted
        await contact.update({
          lastContacted: new Date()
        });
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Send Message Error:', err);
    res.json({ 
      success: false, 
      error: err.response?.data?.message || err.message || 'Unknown error'
    });
  }
};

// Get inbound messages (for external systems to retrieve)
exports.getInboundMessages = async (req, res) => {
  try {
    const { limit = 10, phone, since, status } = req.query;

    // Build where clause
    const where = {
      direction: 'inbound'
    };

    // Filter by phone if provided
    if (phone) {
      where.phone = phone;
    }

    // Filter by status if provided
    if (status) {
      where.status = status;
    }

    // Filter by date if provided (messages after this date)
    if (since) {
      where.created_at = {
        [Op.gte]: new Date(since)
      };
    }

    // Get inbound messages
    // Use a very high limit or no limit if limit is very high
    const queryLimit = parseInt(limit) >= 1000 ? null : parseInt(limit);
    const messages = await MetaMessage.findAll({
      where,
      limit: queryLimit, // null means no limit
      order: [['created_at', 'DESC']],
      attributes: [
        'id',
        'phone',
        'direction',
        'message_type',
        'message_text',
        'status',
        'created_at'
      ]
    });

    res.json({
      success: true,
      count: messages.length,
      messages: messages.map(msg => ({
        id: msg.id,
        phone: msg.phone,
        direction: msg.direction,
        message_type: msg.message_type,
        text: msg.message_text,
        status: msg.status,
        received_at: msg.created_at
      }))
    });
  } catch (err) {
    console.error('Get Inbound Messages Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get inbound messages'
    });
  }
};

// Get all meta messages (inbound + outbound) by phone
exports.getAllMetaMessages = async (req, res) => {
  try {
    const { phone, limit = 100, since, direction } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Build where clause
    const where = {
      phone: phone
    };

    // Filter by direction if provided
    if (direction) {
      where.direction = direction;
    }

    // Filter by date if provided (messages after this date)
    if (since) {
      where.created_at = {
        [Op.gte]: new Date(since)
      };
    }

    // Get all messages for this phone
    // Use a very high limit or no limit if limit is very high
    const queryLimit = parseInt(limit) >= 10000 ? null : parseInt(limit);
    const messages = await MetaMessage.findAll({
      where,
      limit: queryLimit, // null means no limit
      order: [['created_at', 'ASC']], // Oldest first for chat view
      attributes: [
        'id',
        'phone',
        'direction',
        'message_type',
        'message_text',
        'status',
        'created_at'
      ]
    });

    res.json({
      success: true,
      count: messages.length,
      messages: messages.map(msg => ({
        id: msg.id,
        phone: msg.phone,
        direction: msg.direction,
        message_type: msg.message_type,
        text: msg.message_text,
        status: msg.status,
        created_at: msg.created_at
      }))
    });
  } catch (err) {
    console.error('Get All Meta Messages Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get meta messages'
    });
  }
};

// Get message status by ID
exports.getMessageStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Message ID is required'
      });
    }

    // Try to find message by ID (could be database ID or external ID from AiSensy)
    // First try as database ID
    let message = await MetaMessage.findByPk(id);

    // If not found, try searching by any external ID field if it exists
    // For now, we'll check if it's a UUID format and search accordingly
    if (!message) {
      // If ID is UUID format, it might be from AiSensy API response
      // Check if we stored it somewhere or need to query AiSensy API
      message = await MetaMessage.findOne({
        where: {
          // Add any field that might store external ID
          // For now, return not found
        }
      });
    }

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
        id: id
      });
    }

    res.json({
      success: true,
      message: {
        id: message.id,
        phone: message.phone,
        direction: message.direction,
        message_type: message.message_type,
        status: message.status,
        message_text: message.message_text,
        created_at: message.created_at
      }
    });
  } catch (err) {
    console.error('Get Message Status Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get message status'
    });
  }
};
