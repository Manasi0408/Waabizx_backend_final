const express = require('express');
const router = express.Router();
const {
  createCampaign,
  getCampaigns,
  getCampaignById,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignAudience
} = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createCampaign);
router.get('/', protect, getCampaigns);
router.get('/:id', protect, getCampaignById);
router.post('/:id/start', protect, startCampaign);
router.post('/:id/pause', protect, pauseCampaign);
router.post('/:id/resume', protect, resumeCampaign);
router.get('/:id/audience', protect, getCampaignAudience);

module.exports = router;
