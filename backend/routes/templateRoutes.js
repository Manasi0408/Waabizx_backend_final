const express = require('express');
const router = express.Router();
const {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  getMetaTemplates,
  createMetaTemplate,
  getMetaTemplateDetails
} = require('../controllers/templateController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createTemplate);
router.post('/create', protect, createMetaTemplate); // Submit template to Meta API
router.get('/', protect, getTemplates);
router.get('/meta', protect, getMetaTemplates);
router.get('/meta/:templateId', protect, getMetaTemplateDetails); // Get detailed template info from Meta
router.get('/:id', protect, getTemplateById);
router.put('/:id', protect, updateTemplate);
router.delete('/:id', protect, deleteTemplate);

module.exports = router;

