require('dotenv').config();
const { WebhookLog, MetaMessage, Contact, Message, InboxMessage, User, WhatsAppAccount, CampaignAudience, Template } = require('../models');
const { Op } = require('sequelize');
const socketService = require('../services/socketService');
const db = require('../config/db'); // MySQL pool for conversations/agent routing
const { sendText } = require('../services/whatsappService');
const { upsertConversationWithQuota } = require('../services/conversationBillingService');

// Defaults shown in the Opt-in Management UI
const OPT_IN_MESSAGE =
  'Thanks! You have been opted in for future marketing messages. You will now receive updates and notifications related to this project.';
const OPT_OUT_MESSAGE =
  'You have been opted out of your future marketing messages. If you would like to receive messages again, reply APPLY above US/APPLY.';

// VERIFY WEBHOOK (for WhatsApp/Meta webhook verification)
exports.verifyWebhook = (req, res) => {
  console.log('=== WEBHOOK VERIFICATION REQUEST ===');
  console.log('Request URL:', req.url);
  console.log('Request Method:', req.method);
  console.log('Query Params:', req.query);
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.VERIFY_TOKEN || process.env.Verify_Token;
  
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

    // Multi-client: identify client by WABA ID (entry[0].id = WABA ID)
    if (payload.object === 'whatsapp_business_account' && payload.entry?.[0]) {
      const wabaId = payload.entry[0].id;
      let clientId = null;
      try {
        const account = await WhatsAppAccount.findOne({ where: { waba_id: wabaId }, attributes: ['client_id'] });
        if (account) clientId = account.client_id;
      } catch (e) {}
      console.log('Message received for WABA:', wabaId, clientId != null ? `(client_id: ${clientId})` : '(no client mapped)');
    }

    // 🔹 2. Handle Meta webhook changes (template status + message status)
    // Wrap properly across all entries/changes (Meta can send multiple entries/changes)
    const entries = payload.entry || [];
    let firstValue = null; // keep for message handling compatibility below

    for (const entry of entries) {
      const changes = entry?.changes || [];

      for (const change of changes) {
        if (!firstValue && change?.value) firstValue = change.value;

        // 🔹 2a. Template status updates (APPROVED / REJECTED / PENDING)
        if (change?.field === 'message_template_status_update') {
          const v = change.value;
          if (!v?.message_template_name) continue;

          const metaEvent = String(v.event || '').toUpperCase();
          const templateName = String(v.message_template_name);

          const metaTemplateId = v.message_template_id != null ? String(v.message_template_id) : null;
          const reason = v.reason != null ? String(v.reason) : null;
          const rejectionInfoReason = v.rejection_info?.reason != null ? String(v.rejection_info.reason) : null;
          const rejectionRecommendation = v.rejection_info?.recommendation != null ? String(v.rejection_info.recommendation) : null;

          await Template.update(
            {
              status:
                metaEvent === 'APPROVED'
                  ? 'approved'
                  : metaEvent === 'REJECTED'
                  ? 'rejected'
                  : 'draft',
              metaTemplateId: metaTemplateId,
              metaStatus: metaEvent,
              rejectionReason: metaEvent === 'REJECTED' ? (reason || '') : null,
              rejectionInfo: metaEvent === 'REJECTED' ? rejectionInfoReason : null,
              rejectionRecommendation: metaEvent === 'REJECTED' ? rejectionRecommendation : null
            },
            { where: { name: templateName } }
          );
        }

        // 🔹 2b. Message status updates (sent/delivered/read)
        // field: "messages"
        const statuses = change?.value?.statuses;
        if (statuses && Array.isArray(statuses)) {
          for (const st of statuses) {
            const waMessageId = st.id;
            const metaStatus = (st.status || '').toLowerCase();
            if (!waMessageId || !['sent', 'delivered', 'read'].includes(metaStatus)) continue;
            try {
              const audience = await CampaignAudience.findOne({
                where: { waMessageId }
              });
              if (audience) {
                const updateData = { status: metaStatus };
                if (metaStatus === 'delivered') updateData.deliveredAt = new Date(parseInt(st.timestamp, 10) * 1000 || Date.now());
                if (metaStatus === 'read') updateData.readAt = new Date(parseInt(st.timestamp, 10) * 1000 || Date.now());
                await audience.update(updateData);
              }
              const inboxMsg = await InboxMessage.findOne({
                where: { waMessageId }
              });
              if (inboxMsg) {
                await inboxMsg.update({ status: metaStatus });
              }
            } catch (e) {
              console.error('Error updating campaign status for', waMessageId, e.message);
            }
          }
        }
      }
    }

    // 🔹 3. Handle Meta/WhatsApp webhook format (entry.changes.value format) — incoming messages
    // For Cloud API, `changes[].value` contains `messages`, `contacts`, etc.
    const valueEntry = firstValue || {};
    const messageObj = valueEntry?.messages?.[0];
    
    if (messageObj) {
      console.log('\n📱 Processing Meta/WhatsApp format webhook');
      // Meta/WhatsApp format
      const waId = valueEntry?.contacts?.[0]?.wa_id;
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
          attributes: ['id', 'phone', 'name', 'email', 'status', 'tags', 'country', 'lastContacted', 'notes', 'userId', 'whatsappOptInAt', 'createdAt', 'updatedAt']
        });

        const wasNewContact = !contact;
        const oldOptedOut = contact
          ? contact.status === 'unsubscribed' || !contact.whatsappOptInAt
          : false;

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

          // WhatsApp keyword consent handling:
          // - START/YES => opt-in
          // - STOP/UNSUBSCRIBE/CANCEL => opt-out
          const normalizedText = (text || '').trim().toUpperCase();
          const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL'];
          const isOptOut =
            optOutKeywords.includes(normalizedText) ||
            optOutKeywords.some((k) => normalizedText.includes(k));

          if (isOptOut) {
            await contact.update({
              status: 'unsubscribed',
              whatsappOptInAt: null
            });
          } else if (
            wasNewContact ||
            normalizedText === 'START' ||
            normalizedText === 'YES' ||
            normalizedText === 'HI'
          ) {
            const optInUpdate = { status: 'active' };
            if (!contact.whatsappOptInAt) {
              optInUpdate.whatsappOptInAt = new Date();
              console.log('✅ Keyword opt-in: consent recorded (whatsappOptInAt set)');
            }
            await contact.update(optInUpdate);
          }

          // Auto-reply on first consent change:
          // - First message for new contact => send opt-in response
          // - STOP/UNSUBSCRIBE/CANCEL => send opt-out response (only if not already opted out)
          let billingAllowed = true;
          try {
            const billing = await upsertConversationWithQuota(userId, fromNumber);
            billingAllowed = !!billing.allowed;
          } catch (billingErr) {
            // If billing tracking fails, don't break webhook processing.
            console.error('Conversation billing check failed (metaWebhookController):', billingErr?.message || billingErr);
          }

          try {
            if (billingAllowed) {
              if (!isOptOut && normalizedText === 'HI') {
                await sendText(fromNumber, OPT_IN_MESSAGE);
              } else if (isOptOut && !oldOptedOut) {
                await sendText(fromNumber, OPT_OUT_MESSAGE);
              }
            }
          } catch (e) {
            console.error('Auto reply sendText failed:', e?.message || e);
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

          // Sync to live-chat (conversations + message) so /live-chat and /inbox both show customer messages
          try {
            const [convRows] = await db.query(
              "SELECT id FROM conversations WHERE phone = ? AND status != 'closed'",
              [fromNumber]
            );
            let convId;
            if (convRows && convRows.length > 0) {
              convId = convRows[0].id;
            } else {
              const [ins] = await db.query(
                "INSERT INTO conversations (phone, customer_name, last_message, status) VALUES (?, ?, ?, 'requesting')",
                [fromNumber, fromNumber, text]
              );
              convId = ins.insertId;
            }
            await db.query(
              "INSERT INTO message (conversation_id, sender, message, created_at) VALUES (?, 'customer', ?, ?)",
              [convId, text, timestamp]
            );
            await db.query("UPDATE conversations SET last_message = ? WHERE id = ?", [text, convId]);
            await db.query("UPDATE conversations SET customer_name = ? WHERE id = ?", [fromNumber, convId]);
            console.log('✅ Synced incoming message to live-chat (conversation id:', convId + ')');
          } catch (syncErr) {
            console.error('Error syncing to live-chat:', syncErr);
          }

          // Emit real-time update (AiSensy-style routing)
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

          // 1️⃣ Look up latest open conversation for this phone to find agent_id
          let agentId = null;
          let conversationId = null;
          try {
            const [rows] = await db.query(
              `SELECT id, agent_id
               FROM conversations
               WHERE phone = ? AND status != 'closed'
               ORDER BY id DESC
               LIMIT 1`,
              [fromNumber]
            );
            if (rows && rows.length > 0) {
              conversationId = rows[0].id;
              agentId = rows[0].agent_id;
            }
          } catch (convErr) {
            console.error('Error fetching conversation for routing (Meta format):', convErr);
          }

          const agentMessagePayload = {
            conversation_id: conversationId,
            phone: fromNumber,
            message: text,
            direction: 'inbound',
            sender: 'customer',
            created_at: timestamp.toISOString()
          };

          if (agentId) {
            // 2️⃣ Route to assigned agent live chat
            socketService.emitToAgent(agentId, 'new-message', agentMessagePayload);
            console.log(`   ✅ Emitted: new-message to agent_${agentId} (conversation ${conversationId || 'N/A'})`);
          } else {
            // 3️⃣ No agent assigned → send to manager requesting queue
            socketService.emitToManager('inbox-update', {
              contactId: contact.id,
              phone: fromNumber,
              lastMessage: text,
              lastMessageTime: timestamp
            });
            console.log('   ✅ Emitted: inbox-update to manager (no agent assigned)');
          }

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
          attributes: ['id', 'phone', 'name', 'email', 'status', 'tags', 'country', 'lastContacted', 'notes', 'userId', 'whatsappOptInAt', 'createdAt', 'updatedAt']
        });

        const wasNewContact = !contact;
        const oldOptedOut = contact
          ? contact.status === 'unsubscribed' || !contact.whatsappOptInAt
          : false;

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

          // WhatsApp keyword consent handling:
          // - START/YES => opt-in
          // - STOP/UNSUBSCRIBE/CANCEL => opt-out
          const normalizedTextAi = (text || '').trim().toUpperCase();
          const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL'];
          const isOptOut =
            optOutKeywords.includes(normalizedTextAi) ||
            optOutKeywords.some((k) => normalizedTextAi.includes(k));

          if (isOptOut) {
            await contact.update({
              status: 'unsubscribed',
              whatsappOptInAt: null
            });
          } else if (
            wasNewContact ||
            normalizedTextAi === 'START' ||
            normalizedTextAi === 'YES' ||
            normalizedTextAi === 'HI'
          ) {
            const optInUpdateAi = { status: 'active' };
            if (!contact.whatsappOptInAt) {
              optInUpdateAi.whatsappOptInAt = new Date();
              console.log('✅ Keyword opt-in (AiSensy): user sent "' + normalizedTextAi + '" – consent recorded (whatsappOptInAt set)');
            }
            await contact.update(optInUpdateAi);
          }

          // Auto-reply on first consent change:
          // - First message for new contact => send opt-in response
          // - STOP/UNSUBSCRIBE/CANCEL => send opt-out response (only if not already opted out)
          let billingAllowedAi = true;
          try {
            const billing = await upsertConversationWithQuota(userId, phone);
            billingAllowedAi = !!billing.allowed;
          } catch (billingErr) {
            console.error('Conversation billing check failed (metaWebhookController AiSensy):', billingErr?.message || billingErr);
          }

          try {
            if (billingAllowedAi) {
              if (!isOptOut && normalizedTextAi === 'HI') {
                await sendText(phone, OPT_IN_MESSAGE);
              } else if (isOptOut && !oldOptedOut) {
                await sendText(phone, OPT_OUT_MESSAGE);
              }
            }
          } catch (e) {
            console.error('Auto reply sendText failed (AiSensy):', e?.message || e);
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

          // Sync to live-chat (conversations + message) so /live-chat and /inbox both show customer messages
          let conversationId = null;
          try {
            const [convRows] = await db.query(
              "SELECT id FROM conversations WHERE phone = ? AND status != 'closed'",
              [phone]
            );
            if (convRows && convRows.length > 0) {
              conversationId = convRows[0].id;
            } else {
              const [ins] = await db.query(
                "INSERT INTO conversations (phone, customer_name, last_message, status) VALUES (?, ?, ?, 'requesting')",
                [phone, phone, text]
              );
              conversationId = ins.insertId;
            }
            await db.query(
              "INSERT INTO message (conversation_id, sender, message) VALUES (?, 'customer', ?)",
              [conversationId, text]
            );
            await db.query("UPDATE conversations SET last_message = ? WHERE id = ?", [text, conversationId]);
            await db.query("UPDATE conversations SET customer_name = ? WHERE id = ?", [phone, conversationId]);
            console.log('✅ Synced incoming message to live-chat (conversation id:', conversationId + ')');
          } catch (syncErr) {
            console.error('Error syncing to live-chat:', syncErr);
          }

          // 🔹 6. Emit real-time update via Socket.IO (AiSensy-style routing)
          console.log('\n📡 Emitting Socket.IO events...');
          // Use InboxMessage ID if available, otherwise fall back to Message ID
          const messageId = inboxMessage?.id || newMessage.id;

          // 1️⃣ Look up latest open conversation for this phone to find agent_id
          let agentId = null;
          try {
            const [rows] = await db.query(
              `SELECT id, agent_id
               FROM conversations
               WHERE phone = ? AND status != 'closed'
               ORDER BY id DESC
               LIMIT 1`,
              [phone]
            );
            if (rows && rows.length > 0) {
              conversationId = conversationId || rows[0].id;
              agentId = rows[0].agent_id;
            }
          } catch (convErr) {
            console.error('Error fetching conversation for routing (AiSensy format):', convErr);
          }

          const agentMessagePayload = {
            conversation_id: conversationId,
            phone,
            message: text,
            direction: 'inbound',
            sender: 'customer',
            created_at: newMessage.sentAt ? newMessage.sentAt.toISOString() : new Date().toISOString()
          };

          if (agentId) {
            // 2️⃣ Route to assigned agent live chat
            socketService.emitToAgent(agentId, 'new-message', agentMessagePayload);
            console.log(`   ✅ Emitted: new-message to agent_${agentId} (conversation ${conversationId || 'N/A'})`);
          } else {
            // 3️⃣ No agent assigned → send to manager requesting queue
            socketService.emitToManager('inbox-update', {
              contactId: contact.id,
              phone,
              lastMessage: text,
              lastMessageTime: newMessage.sentAt || new Date()
            });
            console.log('   ✅ Emitted: inbox-update to manager (no agent assigned)');
          }

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
    const { limit = 50, event_type, phone } = req.query;

    const where = {};
    if (event_type) {
      where.event_type = event_type;
    }

    // Use a very high limit or no limit if limit is very high
    const queryLimit = parseInt(limit) >= 1000 ? null : parseInt(limit);
    let logs = await WebhookLog.findAll({
      where,
      limit: queryLimit, // null means no limit
      order: [['created_at', 'DESC']],
      attributes: ['id', 'event_type', 'payload', 'created_at']
    });

    // Filter by phone if provided (search in payload)
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      logs = logs.filter(log => {
        try {
          const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
          // Check various phone fields in payload
          const fromNumber = payload.from || payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || 
                            payload.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
          if (fromNumber) {
            const normalizedFrom = String(fromNumber).replace(/\D/g, '');
            return normalizedFrom === normalizedPhone || normalizedFrom.endsWith(normalizedPhone) || normalizedPhone.endsWith(normalizedFrom);
          }
          return false;
        } catch (e) {
          return false;
        }
      });
    }

    res.json({
      success: true,
      count: logs.length,
      logs: logs.map(log => {
        try {
          return {
            id: log.id,
            event_type: log.event_type,
            payload: typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload,
            received_at: log.created_at,
            created_at: log.created_at
          };
        } catch (e) {
          return {
            id: log.id,
            event_type: log.event_type,
            payload: {},
            received_at: log.created_at,
            created_at: log.created_at
          };
        }
      })
    });
  } catch (err) {
    console.error('Get Webhook Logs Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get webhook logs'
    });
  }
};