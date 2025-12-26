const express = require('express');
const router = express.Router();
const {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  startCampaign
} = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createCampaign);
router.get('/', protect, getCampaigns);
router.get('/:id', protect, getCampaignById);
router.put('/:id', protect, updateCampaign);
router.delete('/:id', protect, deleteCampaign);
router.post('/:id/start', protect, startCampaign);

module.exports = router;