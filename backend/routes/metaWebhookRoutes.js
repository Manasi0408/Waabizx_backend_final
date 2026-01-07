const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/metaWebhookController');
const { protect } = require('../middleware/authMiddleware');

// Webhook endpoint (receives messages from AiSensy) - no auth needed
router.post('/aisensy', webhookController.handleWebhook);

// Get webhook logs (for debugging) - requires authentication
router.get('/logs', protect, webhookController.getWebhookLogs);

module.exports = router;
