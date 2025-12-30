const { WebhookLog, MetaMessage, Contact, Message, User } = require('../models');

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
          await Message.create({
            contactId: contact.id,
            content: text,
            type: 'incoming',
            status: 'delivered', // Incoming messages are considered delivered
            sentAt: new Date(),
            deliveredAt: new Date()
          });

          // 🔹 5. Update contact's lastContacted
          await contact.update({
            lastContacted: new Date()
          });
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
