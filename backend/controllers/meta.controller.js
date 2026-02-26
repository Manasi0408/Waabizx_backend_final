const metaService = require('../services/meta.service');

exports.handleCallback = async (req, res) => {
  try {
    const { code, state: clientId } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    await metaService.completeOnboarding(code, clientId ? parseInt(clientId, 10) : null);

    res.send('WhatsApp connected successfully');
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Onboarding failed');
  }
};

exports.handleOnboard = async (req, res) => {
  try {
    const { code, client_id: clientId } = req.body;

    if (!code || clientId == null) {
      return res.status(400).json({ success: false, error: 'Missing code or client_id' });
    }

    const result = await metaService.completeOnboarding(code, parseInt(clientId, 10));

    res.json({
      success: true,
      message: 'Onboarding complete',
      data: result,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Onboarding failed',
      message: error.response?.data?.error?.message || error.message,
    });
  }
};
