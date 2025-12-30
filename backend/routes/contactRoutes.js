const express = require('express');
const router = express.Router();
const {
  createContact,
  getContacts,
  getContactById,
  importContacts,
  updateContact,
  optOutContact,
  deleteContact
} = require('../controllers/contactController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createContact);
router.get('/', protect, getContacts);
router.get('/:id', protect, getContactById);
router.post('/import', protect, importContacts);
router.put('/:id', protect, updateContact);
router.put('/:id/opt-out', protect, optOutContact);
router.delete('/:id', protect, deleteContact);

module.exports = router;