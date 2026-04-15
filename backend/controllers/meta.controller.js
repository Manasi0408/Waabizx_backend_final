const metaService = require('../services/meta.service');
const { getProjectId } = require('../utils/projectScope');

const protoAndHost = (req) => {
  const host = String(req.get('host') || '').trim();
  if (!host) return null;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || (req.secure ? 'https' : req.protocol) || 'https';
  return { proto, host };
};

/**
 * OAuth redirect_uri for GET /meta/callback: must match /dialog/oauth exactly.
 * Use the URL Meta redirected to (not server-only META_REDIRECT_URI), so env
 * cannot drift from REACT_APP_* / frontend.
 */
const redirectUriFromOAuthCallbackRequest = (req) => {
  const ph = protoAndHost(req);
  if (!ph) {
    const fromEnv = String(process.env.META_REDIRECT_URI || process.env.REDIRECT_URI || '').trim();
    if (fromEnv) return fromEnv;
    throw new Error('META_REDIRECT_URI is required when the callback request has no Host header');
  }
  const pathname = `${req.baseUrl || ''}${req.path || ''}` || '/meta/callback';
  return `${ph.proto}://${ph.host}${pathname}`;
};

/** Default callback URL when exchanging a code from POST /meta/onboard (not a browser redirect hit). */
const defaultMetaCallbackRedirectUri = (req) => {
  const ph = protoAndHost(req);
  if (!ph) return '';
  return `${ph.proto}://${ph.host}/meta/callback`;
};

exports.handleCallback = async (req, res) => {
  try {
    const code = req.query.code;
    const stateRaw = req.query.state;
    const stateClientId = stateRaw != null ? parseInt(String(stateRaw).split(':')[0], 10) : null;
    const clientId = Number.isInteger(stateClientId) && stateClientId > 0 ? stateClientId : null;

    if (!code) {
      return res.status(400).json({
        success: false,
        onboardingCompleted: false,
        message: 'Missing code in callback',
      });
    }
    if (!clientId) {
      return res.status(400).json({
        success: false,
        onboardingCompleted: false,
        message: 'Missing or invalid state/client id in callback',
      });
    }

    const callbackRedirectUri = redirectUriFromOAuthCallbackRequest(req);

    const result = await metaService.completeOnboarding(
      code,
      clientId,
      getProjectId(req),
      callbackRedirectUri
    );
    const status = await metaService.getOnboardingStatus(clientId, getProjectId(req));

    return res.status(200).json({
      success: true,
      message: 'Meta onboarding callback processed',
      onboardingCompleted: Boolean(status.onboardingCompleted),
      callback: {
        clientId,
        state: stateRaw || null,
        codeReceived: true,
      },
      data: result,
      verification: status,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      onboardingCompleted: false,
      message: 'Onboarding failed during callback processing',
      error: err?.response?.data?.error?.message || err.message,
    });
  }
};

exports.handleOnboard = async (req, res) => {
  try {
    const { code, client_id: clientId } = req.body;
    const redirectUri = String(req.body?.redirect_uri || '').trim()
      || String(process.env.META_REDIRECT_URI || process.env.REDIRECT_URI || '').trim()
      || defaultMetaCallbackRedirectUri(req);

    if (!code || clientId == null) {
      return res.status(400).json({ success: false, error: 'Missing code or client_id' });
    }

    const result = await metaService.completeOnboarding(
      code,
      parseInt(clientId, 10),
      getProjectId(req),
      redirectUri
    );

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

exports.getOnboardingStatus = async (req, res) => {
  try {
    const fromQuery = parseInt(req.query.client_id, 10);
    const fromState = parseInt(String(req.query.state || '').split(':')[0], 10);
    const clientId = Number.isInteger(fromQuery) && fromQuery > 0
      ? fromQuery
      : Number.isInteger(fromState) && fromState > 0
        ? fromState
        : null;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        onboardingCompleted: false,
        message: 'client_id is required',
      });
    }

    const status = await metaService.getOnboardingStatus(clientId, getProjectId(req));
    return res.status(200).json({
      success: true,
      ...status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      onboardingCompleted: false,
      message: 'Failed to fetch onboarding status',
      error: error.message,
    });
  }
};
