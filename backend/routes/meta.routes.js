const router = require('express').Router();
const metaController = require('../controllers/meta.controller');

router.get('/callback', metaController.handleCallback);
router.post('/onboard', metaController.handleOnboard);
router.get('/onboarding-status', metaController.getOnboardingStatus);

module.exports = router;
