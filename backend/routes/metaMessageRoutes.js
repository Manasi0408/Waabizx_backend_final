const express = require('express');
const router = express.Router();
const messageController = require('../controllers/metaMessageController');

router.post('/send', messageController.sendMessage);

module.exports = router;
