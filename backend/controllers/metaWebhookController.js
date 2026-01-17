require('dotenv').config();
const { WebhookLog, MetaMessage, Contact, Message, InboxMessage, User } = require('../models');
const { Op } = require('sequelize');
const socketService = require('../services/socketService');

// VERIFY WEBHOOK (for WhatsApp/Meta webhook verification)
exports.verifyWebhook = (req, res) => {
  console.log('=== WEBHOOK VERIFICATION REQUEST ===');
  console.log('Request URL:', req.url);
  console.log('Request Method:', req.method);
  console.log('Query Params:', req.query);
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check both VERIFY_TOKEN and Verify_Token (for compatibility)
  const verifyToken = process.env.Verify_Token;
  
  console.log('Received mode:', mode);
  console.log('Received token:', token);
  console.log('Expected token:', verifyToken);
  console.log('Challenge:', challenge);

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook Verified Successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    console.log('Mode check:', mode === 'subscribe' ? 'PASS' : 'FAIL');
    console.log('Token check:', token === verifyToken ? 'PASS' : 'FAIL');
    res.sendStatus(403);
  }
};

// HANDLE INCOMING WEBHOOK (supports both Meta/WhatsApp and AiSensy formats)
exports.handleWebhook = async (req, res) => {
  try {
    const payload = req.body;

    console.log('\n========================================');
    console.log('=== INCOMING WEBHOOK RECEIVED ===');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Webhook Payload:', JSON.stringify(payload, null, 2));

    // 🔹 1. Save raw webhook (for debugging & audit)
    const eventType = payload.event || (payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ? 'message_received' : 'unknown');
    console.log('📋 Event Type:', eventType);
    
    const webhookLog = await WebhookLog.create({
      event_type: eventType,
      payload: JSON.stringify(payload)
    });
    console.log('✅ Webhook log saved to DB (ID:', webhookLog.id + ')');

    // 🔹 2. Handle Meta/WhatsApp webhook format (entry.changes.value format)
    const entry = payload.entry?.[0]?.changes?.[0]?.value;
    const messageObj = entry?.messages?.[0];
    
    if (messageObj) {
      console.log('\n📱 Processing Meta/WhatsApp format webhook');
      // Meta/WhatsApp format
      const waId = entry?.contacts?.[0]?.wa_id;
      const fromNumber = messageObj.from;
      const text = messageObj.text?.body || 'Non-text message';
      const timestamp = new Date(messageObj.timestamp * 1000);

      console.log('📞 From Number:', fromNumber);
      console.log('💬 Message Text:', text);
      console.log('📅 Timestamp:', timestamp.toISOString());
      console.log('🆔 WA ID:', waId || 'N/A');

      if (fromNumber) {
        // Save to MetaMessage
        const metaMessage = await MetaMessage.create({
          phone: fromNumber,
          direction: 'inbound',
          message_type: 'text',
          message_text: text,
          status: 'received'
        });
        console.log('✅ MetaMessage saved to DB (ID:', metaMessage.id + ')');

        // Find or create contact
        // First, try to find existing contact by phone number (across all users)
        // This ensures we match the contact created when template was sent
        console.log('\n🔍 Searching for contact with phone:', fromNumber);
        let contact = await Contact.findOne({
          where: {
            phone: fromNumber
          },
          order: [['updatedAt', 'DESC']], // Get most recently updated contact
          attributes: ['id', 'phone', 'name', 'email', 'status', 'tags', 'country', 'lastContacted', 'notes', 'userId', 'createdAt', 'updatedAt']
        });

        let userId;

        if (contact) {
          // Use the userId from existing contact
          userId = contact.userId;
          console.log('✅ Existing contact found!');
          console.log('   Contact ID:', contact.id);
          console.log('   User ID:', userId);
          console.log('   Phone:', contact.phone);
          console.log('   Name:', contact.name);
          console.log('   Last Contacted:', contact.lastContacted);
        } else {
          console.log('⚠️ Contact not found, creating new one...');
          // No contact found, create new one with first active user
          const firstUser = await User.findOne({
            where: { status: 'active' },
            order: [['id', 'ASC']]
          });

          if (!firstUser) {
            console.log('❌ ERROR: No active user found - cannot create contact');
            console.log('   Message will not be saved to inbox');
            return res.status(200).json({ success: true }); // Return success to webhook
          }

          userId = firstUser.id;
          console.log('👤 Creating new contact with user (ID:', userId + ')');
          
          contact = await Contact.create({
            userId: userId,
            phone: fromNumber,
            name: fromNumber, // Default name to phone number
            status: 'active'
          });
          console.log('✅ New contact created!');
          console.log('   Contact ID:', contact.id);
          console.log('   User ID:', userId);
        }

          // Save message to Message table (for inbox compatibility)
          console.log('\n💾 Saving message to Message table...');
          const newMessage = await Message.create({
            contactId: contact.id,
            content: text,
            type: 'incoming',
            status: 'delivered',
            sentAt: timestamp,
            deliveredAt: timestamp
          });
          console.log('✅ Message saved to Message table! ID:', newMessage.id);

          // 🔹 CRITICAL: Also save to InboxMessage table (inbox fetches from here!)
          console.log('\n💾 Saving message to InboxMessage table...');
          let inboxMessage = null;
          try {
            inboxMessage = await InboxMessage.create({
              contactId: contact.id,
              userId: userId,
              direction: 'incoming',
              message: text,
              type: 'text',
              status: 'delivered',
              timestamp: timestamp
            });
            console.log('✅ Message saved to InboxMessage table! ID:', inboxMessage.id);
          } catch (inboxError) {
            console.error('❌ Error saving to InboxMessage:', inboxError);
            // Don't fail the whole request if this fails
          }

          console.log('\n🔄 Updating contact lastContacted...');
          await contact.update({
            lastContacted: timestamp
          });
          console.log('✅ Contact lastContacted updated to:', timestamp.toISOString());

          // Emit real-time update
          console.log('\n📡 Emitting Socket.IO events...');
          // Use InboxMessage ID if available, otherwise fall back to Message ID
          const messageId = inboxMessage?.id || newMessage.id;
          const messageData = {
            id: messageId,
            contactId: contact.id,
            phone: fromNumber, // Include phone for frontend matching
            content: text,
            type: 'incoming',
            status: 'delivered',
            sentAt: timestamp.toISOString(),
            deliveredAt: timestamp.toISOString(),
            createdAt: newMessage.createdAt ? newMessage.createdAt.toISOString() : timestamp.toISOString()
          };
          
          socketService.emitToContact(contact.id, 'new-message', messageData);
          console.log('   ✅ Emitted: new-message to contact', contact.id, 'Message ID:', messageId);
          
          socketService.emitToUser(userId, 'inbox-update', {
            contactId: contact.id,
            lastMessage: text,
            lastMessageTime: timestamp
          });
          console.log('   ✅ Emitted: inbox-update to user', userId);
          
          console.log('\n✅ All processing complete for Meta/WhatsApp format');
          console.log('========================================\n');
      }
    }

    // 🔹 3. Process AiSensy webhook format (event-based)
    if (payload.event === 'message_received') {
      console.log('\n📱 Processing AiSensy format webhook');
      const phone = payload.from;
      const text = payload?.message?.text || '';

      console.log('📞 From Number:', phone);
      console.log('💬 Message Text:', text);

      if (phone) {
        // Save to MetaMessage for webhook tracking
        const metaMessage = await MetaMessage.create({
          phone,
          direction: 'inbound',
          message_type: 'text',
          message_text: text,
          status: 'received'
        });
        console.log('✅ MetaMessage saved to DB (ID:', metaMessage.id + ')');

        // 🔹 3. Find or create contact
        // First, try to find existing contact by phone number (across all users)
        // This ensures we match the contact created when template was sent
        console.log('\n🔍 Searching for contact with phone:', phone);
        let contact = await Contact.findOne({
          where: {
            phone: phone
          },
          order: [['updatedAt', 'DESC']], // Get most recently updated contact
          attributes: ['id', 'phone', 'name', 'email', 'status', 'tags', 'country', 'lastContacted', 'notes', 'userId', 'createdAt', 'updatedAt']
        });

        let userId;

        if (contact) {
          // Use the userId from existing contact
          userId = contact.userId;
          console.log('✅ Existing contact found!');
          console.log('   Contact ID:', contact.id);
          console.log('   User ID:', userId);
          console.log('   Phone:', contact.phone);
          console.log('   Name:', contact.name);
          console.log('   Last Contacted:', contact.lastContacted);
        } else {
          console.log('⚠️ Contact not found, creating new one...');
          // No contact found, create new one with first active user
          const firstUser = await User.findOne({
            where: { status: 'active' },
            order: [['id', 'ASC']]
          });

          if (!firstUser) {
            console.log('❌ ERROR: No active user found - cannot create contact');
            console.log('   Message will not be saved to inbox');
            return res.status(200).json({ success: true }); // Return success to webhook
          }

          userId = firstUser.id;
          console.log('👤 Creating new contact with user (ID:', userId + ')');
          
          contact = await Contact.create({
            userId: userId,
            phone: phone,
            name: phone, // Default name to phone number
            status: 'active'
          });
          console.log('✅ New contact created!');
          console.log('   Contact ID:', contact.id);
          console.log('   User ID:', userId);
        }

          // 🔹 4. Save message to Message table (for inbox compatibility)
          console.log('\n💾 Saving message to Message table...');
          const newMessage = await Message.create({
            contactId: contact.id,
            content: text,
            type: 'incoming',
            status: 'delivered', // Incoming messages are considered delivered
            sentAt: new Date(),
            deliveredAt: new Date()
          });
          console.log('✅ Message saved to Message table! ID:', newMessage.id);

          // 🔹 CRITICAL: Also save to InboxMessage table (inbox fetches from here!)
          console.log('\n💾 Saving message to InboxMessage table...');
          let inboxMessage = null;
          try {
            inboxMessage = await InboxMessage.create({
              contactId: contact.id,
              userId: userId,
              direction: 'incoming',
              message: text,
              type: 'text',
              status: 'delivered',
              timestamp: new Date()
            });
            console.log('✅ Message saved to InboxMessage table! ID:', inboxMessage.id);
          } catch (inboxError) {
            console.error('❌ Error saving to InboxMessage:', inboxError);
            // Don't fail the whole request if this fails
          }

          // 🔹 5. Update contact's lastContacted
          console.log('\n🔄 Updating contact lastContacted...');
          await contact.update({
            lastContacted: new Date()
          });
          console.log('✅ Contact lastContacted updated to:', new Date().toISOString());

          // 🔹 6. Emit real-time update via Socket.IO
          console.log('\n📡 Emitting Socket.IO events...');
          // Use InboxMessage ID if available, otherwise fall back to Message ID
          const messageId = inboxMessage?.id || newMessage.id;
          const messageData = {
            id: messageId,
            contactId: contact.id,
            phone: fromNumber, // Include phone for frontend matching
            content: text,
            type: 'incoming',
            status: 'delivered',
            sentAt: newMessage.sentAt ? newMessage.sentAt.toISOString() : timestamp.toISOString(),
            deliveredAt: newMessage.deliveredAt ? newMessage.deliveredAt.toISOString() : timestamp.toISOString(),
            createdAt: newMessage.createdAt ? newMessage.createdAt.toISOString() : timestamp.toISOString()
          };
          
          socketService.emitToContact(contact.id, 'new-message', messageData);
          console.log('   ✅ Emitted: new-message to contact', contact.id, 'Message ID:', messageId);
          
          socketService.emitToUser(userId, 'inbox-update', {
            contactId: contact.id,
            lastMessage: text,
            lastMessageTime: timestamp
          });
          console.log('   ✅ Emitted: inbox-update to user', userId);
          
          console.log('\n✅ All processing complete for AiSensy format');
          console.log('========================================\n');
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
            where: { phone, userId: firstUser.id },
            attributes: ['id', 'phone', 'name', 'email', 'status', 'tags', 'country', 'lastContacted', 'notes', 'userId', 'createdAt', 'updatedAt']
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
    console.log('\n✅ Webhook processed successfully - returning 200 OK');
    console.log('========================================\n');
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ WEBHOOK ERROR:', error);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('========================================\n');

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