const axios = require('axios');
const { ClientWhatsApp } = require('../models');

const APP_ID = process.env.APP_ID || process.env.META_APP_ID;
const APP_SECRET = process.env.APP_SECRET || process.env.META_APP_SECRET;
const API_VERSION = 'v19.0';

async function exchangeCode(code) {
  const response = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token`,
    {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        code,
      },
    }
  );
  return response.data.access_token;
}

async function getLongLivedToken(shortToken) {
  const response = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token`,
    {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: shortToken,
      },
    }
  );
  return response.data.access_token;
}

async function getWabaId(token) {
  const response = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/me?fields=whatsapp_business_accounts`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const accounts = response.data.whatsapp_business_accounts?.data;
  if (!accounts || accounts.length === 0) {
    throw new Error('No WhatsApp Business Account found');
  }
  return accounts[0].id;
}

async function getPhoneNumberId(token, wabaId) {
  const response = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/${wabaId}/phone_numbers`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const phones = response.data.data;
  if (!phones || phones.length === 0) {
    throw new Error('No phone number found for WABA');
  }
  return phones[0].id;
}

exports.onboard = async (req, res) => {
  try {
    const { code, client_id: clientId } = req.body;

    if (!code || !clientId) {
      return res.status(400).json({
        success: false,
        message: 'Missing code or client_id',
      });
    }

    if (!APP_ID || !APP_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Server misconfiguration: APP_ID or APP_SECRET not set',
      });
    }

    const shortToken = await exchangeCode(code);
    const longLivedToken = await getLongLivedToken(shortToken);
    const wabaId = await getWabaId(longLivedToken);
    const phoneNumberId = await getPhoneNumberId(longLivedToken, wabaId);

    const [row] = await ClientWhatsApp.findOrCreate({
      where: { client_id: clientId },
      defaults: { waba_id: wabaId, phone_number_id: phoneNumberId, access_token: longLivedToken },
    });
    if (!row.isNewRecord) {
      await row.update({ waba_id: wabaId, phone_number_id: phoneNumberId, access_token: longLivedToken });
    }

    return res.status(200).json({
      success: true,
      message: 'Onboarding complete',
      data: {
        client_id: clientId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
      },
    });
  } catch (error) {
    console.error('Meta onboard error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'Onboarding failed';
    return res.status(status).json({
      success: false,
      message: typeof message === 'string' ? message : 'Onboarding failed',
    });
  }
};
