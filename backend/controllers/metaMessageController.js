const aisensyService = require('../services/aisensyService');
const { MetaMessage } = require('../models');

exports.sendMessage = async (req, res) => {
  try {
    const { phone, text } = req.body;

    if (!phone || !text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone and text are required' 
      });
    }

    const result = await aisensyService.sendTextMessage({ phone, text });

    await MetaMessage.create({
      phone,
      direction: 'outbound',
      message_type: 'text',
      message_text: text,
      status: 'sent'
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Send Message Error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to send message' 
    });
  }
};
