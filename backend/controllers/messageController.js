const axios = require('axios');
const { Message, Contact, User, InboxMessage, Template } = require('../models');
const { Op } = require('sequelize');
const socketService = require('../services/socketService');
const { upsertConversationWithQuota } = require('../services/conversationBillingService');

// Send message via Meta API
exports.sendMessage = async (req, res) => {
  try {
    // Get userId from authenticated user (middleware sets req.user)
    const userId = req.user.id;
    
    // Log incoming payload for debugging
    console.log('📥 Inbox payload received:', JSON.stringify(req.body, null, 2));
    
    // Accept multiple field name formats (phone, to, contact.phone) and (message, text, content)
    let phone = req.body.phone || req.body.to || req.body.contact?.phone;
    let message = req.body.message || req.body.text || req.body.content;

    // Validate input with detailed error messages
    if (!phone) {
      console.error('❌ Missing phone number in payload:', req.body);
      return res.status(400).json({ 
        success: false, 
        msg: "Missing required field: phone (or 'to' or 'contact.phone')",
        receivedPayload: req.body
      });
    }

    if (!message) {
      console.error('❌ Missing message content in payload:', req.body);
      return res.status(400).json({ 
        success: false, 
        msg: "Missing required field: message (or 'text' or 'content')",
        receivedPayload: req.body
      });
    }

    // Normalize phone number format (ensure it has country code)
    // Remove any spaces, dashes, parentheses
    phone = phone.toString().replace(/[\s\-\(\)]/g, '');
    
    // If phone doesn't start with country code, log warning but still try
    if (!phone.match(/^\d{10,15}$/)) {
      console.warn('⚠️  Phone number format may be invalid:', phone);
    }
    
    console.log('✅ Processed request - Phone:', phone, 'Message:', message.substring(0, 50) + (message.length > 50 ? '...' : ''));

    // Check environment variables (check multiple possible names)
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || 
                          process.env.PHONE_NUMBER_ID || 
                          process.env.Phone_Number_ID;
    const permanentToken = process.env.WHATSAPP_TOKEN || 
                          process.env.PERMANENT_TOKEN || 
                          process.env.Whatsapp_Token;
    
    console.log('🔍 Checking environment variables...');
    console.log('  WHATSAPP_PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID ? '✓ Found' : '✗ Missing');
    console.log('  PHONE_NUMBER_ID:', process.env.PHONE_NUMBER_ID ? '✓ Found' : '✗ Missing');
    console.log('  Phone_Number_ID:', process.env.Phone_Number_ID ? '✓ Found' : '✗ Missing');
    console.log('  WHATSAPP_TOKEN:', process.env.WHATSAPP_TOKEN ? '✓ Found' : '✗ Missing');
    console.log('  PERMANENT_TOKEN:', process.env.PERMANENT_TOKEN ? '✓ Found' : '✗ Missing');
    console.log('  Whatsapp_Token:', process.env.Whatsapp_Token ? '✓ Found' : '✗ Missing');
    console.log('  Selected PHONE_NUMBER_ID:', phoneNumberId || 'NONE');
    console.log('  Selected TOKEN:', permanentToken ? (permanentToken.substring(0, 10) + '...') : 'NONE');
    
    if (!phoneNumberId || !permanentToken) {
      console.error("❌ Missing Meta WhatsApp API credentials!");
      console.error("  PHONE_NUMBER_ID:", phoneNumberId ? "✓ Found" : "✗ Missing");
      console.error("  TOKEN:", permanentToken ? "✓ Found" : "✗ Missing");
      console.error("\n📝 To enable message sending, add these to your .env file:");
      console.error("  WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id");
      console.error("  WHATSAPP_TOKEN=your_permanent_access_token");
      console.error("\n💡 Alternative names also supported:");
      console.error("  PHONE_NUMBER_ID or Phone_Number_ID");
      console.error("  PERMANENT_TOKEN or Whatsapp_Token");
      
      // Still allow the request to proceed - save to DB but mark as failed
      // This allows testing the endpoint structure even without API credentials
      // Find or create contact
      let contact = await Contact.findOne({ where: { phone, userId } });
      if (!contact) {
        contact = await Contact.create({
          userId,
          phone,
          name: phone,
          status: 'active'
        });
      }

      // Save message with failed status (API credentials missing)
      console.error('💾 Saving message to database with status=failed (credentials missing)...');
      const saved = await InboxMessage.create({
        contactId: contact.id,
        userId,
        direction: "outgoing",
        message,
        type: "text",
        status: "failed",
        timestamp: new Date()
      });
      console.error('💾 Message saved to DB with status=failed (ID:', saved.id + ')');
      console.error('   Reason: API credentials not configured');

      return res.json({ 
        success: false, 
        msg: "API credentials not configured. Message saved but not sent.",
        data: saved,
        warning: {
          PHONE_NUMBER_ID: phoneNumberId ? "Found" : "Missing",
          PERMANENT_TOKEN: permanentToken ? "Found" : "Missing",
          message: "Add credentials to .env file to enable actual message sending"
        }
      });
    }

    // Find contact - try exact match first, then normalize and try again
    let contact = await Contact.findOne({ where: { phone, userId } });
    
    // If not found, try creating contact automatically (for new conversations)
    if (!contact) {
      console.log('⚠️  Contact not found, creating new contact for phone:', phone);
      try {
        contact = await Contact.create({
          userId,
          phone,
          name: phone, // Default name to phone number
          status: 'active'
        });
        console.log('✅ Created new contact (ID:', contact.id + ')');
      } catch (createError) {
        console.error('❌ Error creating contact:', createError);
        return res.status(404).json({ 
          success: false, 
          msg: `Contact not found and could not be created for phone: ${phone}`,
          error: createError.message
        });
      }
    } else {
      console.log('✅ Contact found (ID:', contact.id + ')');
    }

    // Conversation billing/quota enforcement (24-hour rolling).
    // Charges only when a new conversation session starts.
    let billingAllowed = true;
    try {
      const billing = await upsertConversationWithQuota(userId, phone);
      billingAllowed = !!billing.allowed;
    } catch (billingErr) {
      console.error('Conversation billing check failed (messageController.sendMessage):', billingErr?.message || billingErr);
    }

    if (!billingAllowed) {
      try {
        await InboxMessage.create({
          contactId: contact.id,
          userId,
          direction: "outgoing",
          message,
          type: "text",
          status: "failed",
          timestamp: new Date()
        });
      } catch (saveErr) {
        console.error('Error saving blocked message by quota:', saveErr);
      }

      return res.status(403).json({
        success: false,
        msg: "Blocked (conversation limit reached)"
      });
    }

    // Send via Meta API (works for both verified and non-verified numbers)
    // For non-verified: Meta will enforce 24-hour restriction automatically
    // For verified: No restriction, message will send
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    
    const apiPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: message }
    };
    
    console.log('📤 Sending to Meta API...');
    console.log('  URL:', url);
    console.log('  Payload:', JSON.stringify(apiPayload, null, 2));
    console.log('  Phone Number ID:', phoneNumberId);
    console.log('  Token (first 20 chars):', permanentToken ? permanentToken.substring(0, 20) + '...' : 'NONE');
    
    let response;
    try {
      response = await axios.post(
        url,
        apiPayload,
        {
          headers: {
            Authorization: `Bearer ${permanentToken}`,
            "Content-Type": "application/json"
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      // Log successful response
      console.log('✅ Meta API Response Status:', response.status);
      console.log('✅ Meta API Response Data:', JSON.stringify(response.data, null, 2));
      
      const waMessageId = response.data.messages?.[0]?.id;
      console.log('✅ WhatsApp Message ID:', waMessageId || 'N/A');
      
      if (!response.data.messages || !waMessageId) {
        console.error('⚠️  WARNING: Meta API response missing message ID!');
        console.error('  Response:', JSON.stringify(response.data, null, 2));
      } else {
        console.log('✅ Message successfully sent to WhatsApp! Message ID:', waMessageId);
      }
    } catch (apiError) {
      console.error("❌ Meta API Error occurred!");
      console.error("  Error Type:", apiError.name);
      console.error("  Error Message:", apiError.message);
      console.error("  Response Status:", apiError.response?.status);
      console.error("  Response Status Text:", apiError.response?.statusText);
      console.error("  Response Data:", JSON.stringify(apiError.response?.data || {}, null, 2));
      console.error("  Request URL:", apiError.config?.url);
      console.error("  Request Method:", apiError.config?.method);
      
      const errorData = apiError.response?.data?.error || {};
      const errorCode = errorData.code;
      const errorMsg = errorData.message || apiError.message || "Failed to send via Meta API";
      
      console.error("  Error Code:", errorCode || 'N/A');
      console.error("  Error Message:", errorMsg);
      
      // Check if it's a 24-hour restriction error (for non-verified numbers)
      // Error codes: 131047, 131026, or message contains "24 hour" or "session"
      const is24HourError = errorCode === 131047 || 
                           errorCode === 131026 ||
                           errorMsg.toLowerCase().includes('24 hour') ||
                           errorMsg.toLowerCase().includes('session') ||
                           errorMsg.toLowerCase().includes('template required');
      
      // Save failed message with error details
      let errorMessageToSave = errorMsg;
      if (errorCode) {
        errorMessageToSave = `[${errorCode}] ${errorMsg}`;
      }
      
      console.error('💾 Saving failed message to database with error details...');
      try {
        const failedMessage = await InboxMessage.create({
          contactId: contact.id,
          userId,
          direction: "outgoing",
          message,
          type: "text",
          status: "failed",
          timestamp: new Date()
          // Note: If InboxMessage table has errorMessage field, add:
          // errorMessage: errorMessageToSave
        });
        console.error('💾 Failed message saved to DB (ID:', failedMessage.id + ')');
        console.error('   Error:', errorMessageToSave);
        console.error('   Error Code:', errorCode || 'N/A');
      } catch (saveError) {
        console.error("❌ Error saving failed message to DB:", saveError);
      }

      // Return specific message for 24-hour restriction
      if (is24HourError) {
        console.error('⚠️  24-HOUR SESSION EXPIRED - User must send message first or use template');
        return res.json({ 
          success: false,
          sessionExpired: true,
          msg: "24 hour session expired. User must send a message first, or use /send-template to send a template message.",
          error: errorMsg,
          errorCode: errorCode
        });
      }

      // Other API errors
      console.error('❌ META API CALL FAILED - Message not sent to WhatsApp');
      return res.json({ 
        success: false, 
        msg: `Meta API Error: ${errorMsg}`,
        error: apiError?.response?.data || apiError.message,
        errorCode: errorCode || 'UNKNOWN'
      });
    }

    // Save in DB
    let saved;
    try {
      saved = await InboxMessage.create({
        contactId: contact.id,
        userId,
        direction: "outgoing",
        message,
        type: "text",
        status: "sent",
        waMessageId: response.data.messages?.[0]?.id || null,
        timestamp: new Date()
      });
    } catch (dbError) {
      console.error("❌ Database Error saving message:", dbError);
      return res.status(500).json({ 
        success: false, 
        msg: `Database Error: ${dbError.message}`,
        error: dbError.message
      });
    }

    // Update last contact time
    try {
      await contact.update({ lastContacted: new Date() });
    } catch (updateError) {
      console.error("Error updating contact:", updateError);
      // Don't fail the request if this fails
    }

    // Emit socket event for real-time updates
    try {
      const messageData = {
        id: saved.id,
        contactId: contact.id,
        phone: phone,
        content: saved.message || saved.content || message, // Map message field to content
        type: 'outgoing',
        status: saved.status,
        sentAt: saved.timestamp ? saved.timestamp.toISOString() : new Date().toISOString(),
        createdAt: saved.createdAt ? saved.createdAt.toISOString() : new Date().toISOString(),
        waMessageId: saved.waMessageId
      };
      console.log('📡 Emitting new-message socket event:', messageData);
      socketService.emitToContact(contact.id, "new-message", messageData);
      socketService.emitToUser(userId, "inbox-update", { contactId: contact.id });
    } catch (socketError) {
      console.error("Error emitting socket:", socketError);
      // Don't fail the request if this fails
    }

    console.log('✅ Message sent successfully! ID:', saved.id, 'Contact:', contact.id, 'Phone:', phone);
    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("Outgoing Error:", err);
    console.error("Error Stack:", err.stack);
    
    // Try to get contact for error handling
    let contact = null;
    try {
      const phone = req.body?.phone;
      const userId = req.user?.id;
      if (phone && userId) {
        contact = await Contact.findOne({ where: { phone, userId } });
      }
    } catch (contactError) {
      console.error("Error finding contact for error log:", contactError);
    }

    // Save failed message
    try {
      await InboxMessage.create({
        contactId: contact?.id || null,
        userId: req.user?.id || null,
        direction: "outgoing",
        message: req.body?.message || "Unknown",
        type: "text",
        status: "failed",
        timestamp: new Date()
      });
    } catch (saveError) {
      console.error("Error saving failed message:", saveError);
    }

    return res.json({ 
      success: false, 
      msg: `Message send failed: ${err.message || "Unknown error"}`,
      error: err.message
    });
  }
};

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

    // Delete message (hard delete since isDeleted column doesn't exist)
    await message.destroy();

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
        // Note: isDeleted column doesn't exist in Messages table
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

// Send template message (for non-verified numbers or starting conversation)
exports.sendTemplate = async (req, res) => {
  try {
    // Get userId from authenticated user
    const userId = req.user.id;
    const { phone, templateName, templateLanguage = "en_US", templateParams = [] } = req.body;
    
    // Get template content from database
    let templateContent = `Template: ${templateName}`;
    try {
      const template = await Template.findOne({
        where: {
          name: templateName,
          userId: userId,
          status: 'approved'
        }
      });
      if (template && template.content) {
        templateContent = template.content;
      }
    } catch (templateError) {
      console.log('Could not fetch template content, using default:', templateError.message);
    }

    // Validate input
    if (!phone || !templateName) {
      return res.json({ 
        success: false, 
        msg: "Missing required fields: phone, templateName" 
      });
    }

    // Check environment variables (check multiple possible names)
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.Phone_Number_ID;
    const TOKEN = process.env.WHATSAPP_TOKEN || process.env.Whatsapp_Token;
    
    if (!PHONE_NUMBER_ID || !TOKEN) {
      return res.status(400).json({ 
        success: false, 
        msg: "API credentials not configured. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN in .env file" 
      });
    }

    // Find or create contact (for template messages, we can create new contacts)
    let contact = await Contact.findOne({ where: { phone, userId } });

    if (!contact) {
      // Create new contact if doesn't exist (for template messages)
      contact = await Contact.create({
        userId,
        phone,
        name: phone, // Default name to phone number
        status: 'active'
      });
      console.log('✅ New contact created for template (ID:', contact.id + ')');
    }

    // Enforce opt-in/out before sending
    const isOptedIn =
      contact.status !== 'unsubscribed' &&
      !!contact.whatsappOptInAt;

    if (!isOptedIn) {
      try {
        await InboxMessage.create({
          contactId: contact.id,
          userId,
          direction: "outgoing",
          message: `Template: ${templateName}`,
          type: "text",
          status: "failed",
          timestamp: new Date()
        });
      } catch (saveErr) {
        console.error('Error saving blocked template:', saveErr);
      }

      return res.status(403).json({
        success: false,
        msg: "Blocked (opt-out / not opted-in)"
      });
    }

    // Conversation billing/quota enforcement (24-hour rolling).
    // Charges only when a new conversation session starts.
    let billingAllowed = true;
    try {
      const billing = await upsertConversationWithQuota(userId, phone);
      billingAllowed = !!billing.allowed;
    } catch (billingErr) {
      console.error('Conversation billing check failed (messageController.sendTemplate):', billingErr?.message || billingErr);
    }

    if (!billingAllowed) {
      try {
        await InboxMessage.create({
          contactId: contact.id,
          userId,
          direction: "outgoing",
          message: `Template: ${templateName}`,
          type: "text",
          status: "failed",
          timestamp: new Date()
        });
      } catch (saveErr) {
        console.error('Error saving blocked template by quota:', saveErr);
      }

      return res.status(403).json({
        success: false,
        msg: "Blocked (conversation limit reached)"
      });
    }

    // Build template payload
    const templatePayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage }
      }
    };

    // Add components only if templateParams provided
    // Ensure templateParams is an array
    let paramsArray = [];
    if (templateParams) {
      if (Array.isArray(templateParams)) {
        paramsArray = templateParams;
      } else if (typeof templateParams === 'string') {
        try {
          paramsArray = JSON.parse(templateParams);
          if (!Array.isArray(paramsArray)) {
            paramsArray = [];
          }
        } catch (e) {
          paramsArray = [];
        }
      } else if (typeof templateParams === 'object') {
        paramsArray = Object.values(templateParams);
      }
    }
    
    if (paramsArray && paramsArray.length > 0) {
      templatePayload.template.components = [
        {
          type: "BODY",
          parameters: paramsArray.map(param => ({ 
            type: "text", 
            text: typeof param === 'string' ? param : String(param)
          }))
        }
      ];
    }

    // Send via Meta API
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    let response;
    try {
      response = await axios.post(
        url,
        templatePayload,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`
          }
        }
      );
      console.log('✅ Template sent via Meta API:', response.data);
    } catch (apiError) {
      console.error("Meta API Template Error:", apiError.response?.data || apiError);
      
      // Save failed message
      try {
        await InboxMessage.create({
          contactId: contact.id,
          userId,
          direction: "outgoing",
          message: `Template: ${templateName}`,
          type: "text",
          status: "failed",
          timestamp: new Date()
        });
      } catch (saveError) {
        console.error("Error saving failed template:", saveError);
      }

      return res.status(500).json({ 
        success: false, 
        message: "Failed to send template",
        error: apiError.response?.data || apiError.message
      });
    }

    // Extract WhatsApp message ID from response
    const waMessageId = response.data.messages?.[0]?.id || null;

    // Ensure table exists before saving
    try {
      await InboxMessage.sync({ alter: false });
    } catch (syncError) {
      console.error("⚠️  Warning: Could not sync InboxMessage table:", syncError.message);
    }

    // Save in DB - CRITICAL: Must save to track template sends
    let savedMessage = null;
    try {
      console.log('💾 Attempting to save template to InboxMessages:', {
        contactId: contact.id,
        userId: userId,
        templateName: templateName,
        waMessageId: waMessageId
      });

      // Verify contact and user exist
      if (!contact || !contact.id) {
        throw new Error("Contact is invalid or missing ID");
      }
      if (!userId) {
        throw new Error("User ID is missing");
      }

      savedMessage = await InboxMessage.create({
        contactId: contact.id,
        userId: userId,
        direction: "outgoing",
        message: templateContent, // Use actual template content instead of "Template: templateName"
        type: "text",
        status: "sent",
        waMessageId: waMessageId,
        timestamp: new Date()
      });
      
      console.log('✅ Template message saved to InboxMessages (ID:', savedMessage.id + ')');
    } catch (dbError) {
      console.error("❌ CRITICAL: Database Error saving template!");
      console.error("Error Type:", dbError.name);
      console.error("Error Message:", dbError.message);
      console.error("Error Stack:", dbError.stack);
      console.error("Attempted Data:", {
        contactId: contact?.id,
        userId: userId,
        templateName: templateName,
        waMessageId: waMessageId,
        direction: "outgoing",
        type: "text",
        status: "sent"
      });

      // Check if it's a table doesn't exist error
      if (dbError.message && (dbError.message.includes("doesn't exist") || dbError.message.includes("Unknown table"))) {
        console.error("⚠️  TABLE MISSING: InboxMessages table doesn't exist!");
        console.error("⚠️  Attempting to create table...");
        try {
          await InboxMessage.sync({ force: false, alter: true });
          console.log("✅ Table created, retrying save...");
          // Retry once
          savedMessage = await InboxMessage.create({
            contactId: contact.id,
            userId: userId,
            direction: "outgoing",
            message: templateContent, // Use actual template content
            type: "text",
            status: "sent",
            waMessageId: waMessageId,
            timestamp: new Date()
          });
          console.log('✅ Template message saved to InboxMessages (ID:', savedMessage.id + ') after table creation');
        } catch (retryError) {
          console.error("❌ Failed to create table or retry save:", retryError.message);
        }
      }

      // Check if it's a foreign key error
      if (dbError.name === 'SequelizeForeignKeyConstraintError' || dbError.message.includes("foreign key")) {
        console.error("⚠️  FOREIGN KEY ERROR: Contact or User doesn't exist!");
        console.error("Contact ID:", contact?.id, "User ID:", userId);
        console.error("Please verify Contact and User exist in database");
      }

      // Still return success since Meta API call succeeded
      // But log the error prominently
      if (!savedMessage) {
        console.error("⚠️  WARNING: Template sent via Meta but NOT saved to database!");
      }
    }

    // Update last contact time (template sent, now user can reply and /send will work)
    try {
      await contact.update({ lastContacted: new Date() });
    } catch (updateError) {
      console.error("Error updating contact:", updateError);
    }

    // Emit socket event for real-time updates
    try {
      if (savedMessage) {
        const messageData = {
          id: savedMessage.id,
          contactId: contact.id,
          phone: phone,
          content: templateContent, // Use actual template content
          type: 'outgoing',
          status: savedMessage.status,
          sentAt: savedMessage.timestamp ? savedMessage.timestamp.toISOString() : new Date().toISOString(),
          createdAt: savedMessage.createdAt ? savedMessage.createdAt.toISOString() : new Date().toISOString(),
          waMessageId: waMessageId,
          isTemplate: true,
          templateName: templateName
        };
        socketService.emitToContact(contact.id, "new-message", messageData);
        socketService.emitToUser(userId, "inbox-update", { contactId: contact.id });
      }
    } catch (socketError) {
      console.error("Error emitting socket:", socketError);
    }

    return res.json({
      success: true,
      msg: "Template sent successfully",
      waMessageId: waMessageId,
      saved: savedMessage ? true : false,
      messageId: savedMessage?.id || null
    });
  } catch (error) {
    console.error("Template Send Error:", error);
    console.error("Error stack:", error.stack);
    const errorMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
    return res.status(500).json({
      success: false,
      message: "Failed to send template",
      error: errorMessage,
      details: error.response?.data || (error.stack ? error.stack.split('\n')[0] : null)
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
        contactId: contact.id
        // Note: isDeleted column doesn't exist in Messages table
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

