const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// Delete message
router.delete('/:messageId', protect, messageController.deleteMessage);

// Forward message
router.post('/:messageId/forward', protect, messageController.forwardMessage);

// Add reaction
router.post('/:messageId/reaction', protect, messageController.addReaction);

// Search messages
router.get('/search', protect, messageController.searchMessages);

// Get paginated messages
router.get('/paginated', protect, messageController.getMessagesPaginated);

module.exports = router;

