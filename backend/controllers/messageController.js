const { Message, Contact, User } = require('../models');
const { Op } = require('sequelize');
const socketService = require('../services/socketService');

// Delete message (soft delete)
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await Message.findByPk(messageId, {
      include: [{
        model: Contact,
        where: { userId },
        required: true
      }]
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Soft delete
    await message.update({
      isDeleted: true,
      deletedAt: new Date()
    });

    // Emit to contact room
    socketService.emitToContact(message.contactId, 'message-deleted', {
      messageId: message.id
    });

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Forward message
exports.forwardMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, contactIds } = req.body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Contact IDs are required'
      });
    }

    const originalMessage = await Message.findByPk(messageId, {
      include: [{
        model: Contact,
        where: { userId },
        required: true
      }]
    });

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const forwardedMessages = [];

    for (const contactId of contactIds) {
      const contact = await Contact.findOne({
        where: { id: contactId, userId }
      });

      if (!contact) continue;

      const forwardedMessage = await Message.create({
        contactId: contact.id,
        content: originalMessage.content,
        type: 'outgoing',
        status: 'sent',
        mediaType: originalMessage.mediaType || 'text',
        mediaUrl: originalMessage.mediaUrl,
        mediaFilename: originalMessage.mediaFilename,
        forwardedFrom: originalMessage.id,
        sentAt: new Date()
      });

      forwardedMessages.push(forwardedMessage);

      // Emit to contact room
      socketService.emitToContact(contact.id, 'new-message', forwardedMessage);
    }

    res.json({
      success: true,
      messages: forwardedMessages,
      count: forwardedMessages.length
    });
  } catch (error) {
    console.error('Error forwarding message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Add reaction to message
exports.addReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        error: 'Emoji is required'
      });
    }

    const message = await Message.findByPk(messageId, {
      include: [{
        model: Contact,
        where: { userId },
        required: true
      }]
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const reactions = message.reactions || [];
    const existingIndex = reactions.findIndex(r => r.userId === userId && r.emoji === emoji);

    if (existingIndex >= 0) {
      // Remove reaction
      reactions.splice(existingIndex, 1);
    } else {
      // Add reaction
      reactions.push({
        userId,
        emoji,
        createdAt: new Date().toISOString()
      });
    }

    await message.update({ reactions });

    // Emit to contact room
    socketService.emitToContact(message.contactId, 'message-reaction', {
      messageId: message.id,
      reactions: message.reactions
    });

    res.json({
      success: true,
      reactions: message.reactions
    });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Search messages in conversation
exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId, query, limit = 50, offset = 0 } = req.query;

    if (!contactId || !query) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID and search query are required'
      });
    }

    const contact = await Contact.findOne({
      where: { id: contactId, userId }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const messages = await Message.findAll({
      where: {
        contactId: contact.id,
        isDeleted: false,
        content: {
          [Op.like]: `%${query}%`
        }
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['sentAt', 'DESC']]
    });

    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get paginated messages
exports.getMessagesPaginated = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId, page = 1, limit = 50 } = req.query;

    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required'
      });
    }

    const contact = await Contact.findOne({
      where: { id: contactId, userId }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: messages } = await Message.findAndCountAll({
      where: {
        contactId: contact.id,
        isDeleted: false
      },
      limit: parseInt(limit),
      offset,
      order: [['sentAt', 'DESC']]
    });

    res.json({
      success: true,
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching paginated messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

