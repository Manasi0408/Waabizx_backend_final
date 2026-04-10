const metaService = require('../services/meta.service');

exports.handleCallback = async (req, res) => {
  try {
    const code = req.query.code;

    const debug = {
      message: 'Callback hit',
      code,
    };

    if (!code) {
      debug.error = 'No code received';
      return res.send(`<pre>${JSON.stringify(debug, null, 2)}</pre>`);
    }

    // Example: calling Meta API (replace with your logic)
    // const response = await axios.post(...)

    debug.success = 'Code received successfully';

    return res.send(`<pre>${JSON.stringify(debug, null, 2)}</pre>`);
  } catch (err) {
    return res.send(`
      <h1>Onboarding failed</h1>
      <pre>${err.message}</pre>
    `);
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
