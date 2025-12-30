const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/metaWebhookController');

router.post('/aisensy', webhookController.handleWebhook);

module.exports = router;
