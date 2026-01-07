const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { protect } = require('../middleware/authMiddleware');

// Upload media
router.post('/upload', protect, mediaController.upload.single('media'), mediaController.uploadMedia);

// Send media message
router.post('/send', protect, mediaController.sendMediaMessage);

module.exports = router;

