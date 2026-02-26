const axios = require('axios');
const { Client, WhatsAppAccount, User } = require('../models');

const APP_ID = process.env.APP_ID || process.env.META_APP_ID;
const APP_SECRET = process.env.APP_SECRET || process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || process.env.META_REDIRECT_URI;
const API_VERSION = 'v19.0';

exports.completeOnboarding = async (code, clientId) => {
  if (!APP_ID || !APP_SECRET) {
    throw new Error('APP_ID and APP_SECRET must be set');
  }

  // 1) Exchange code for short-lived token
  const tokenRes = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token`,
    {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      },
    }
  );
  const shortToken = tokenRes.data.access_token;

  // 2) Convert to long-lived token
  const longRes = await axios.get(
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
  const longToken = longRes.data.access_token;
  const expiresIn = longRes.data.expires_in;
  const tokenExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  // 3) Get WABA
  const wabaRes = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/me?fields=whatsapp_business_accounts`,
    {
      headers: { Authorization: `Bearer ${longToken}` },
    }
  );
  const wabaData = wabaRes.data.whatsapp_business_accounts?.data;
  if (!wabaData || wabaData.length === 0) {
    throw new Error('No WhatsApp Business Account found');
  }
  const wabaId = wabaData[0].id;

  // 4) Get phone number
  const phoneRes = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/${wabaId}/phone_numbers`,
    {
      headers: { Authorization: `Bearer ${longToken}` },
    }
  );
  const phoneData = phoneRes.data.data;
  if (!phoneData || phoneData.length === 0) {
    throw new Error('No phone number found for WABA');
  }
  const phoneNumberId = phoneData[0].id;

  // 5) Save to database (multi-tenant: client + whatsapp_accounts)
  if (clientId != null) {
    let name = '';
    let email = '';
    try {
      const user = await User.findByPk(clientId);
      if (user) {
        name = user.name || '';
        email = user.email || '';
      }
    } catch (e) {}
    await Client.findOrCreate({
      where: { id: clientId },
      defaults: { id: clientId, name, email },
    });
    const [account] = await WhatsAppAccount.findOrCreate({
      where: { client_id: clientId },
      defaults: {
        client_id: clientId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: longToken,
        token_expiry: tokenExpiry,
      },
    });
    if (!account.isNewRecord) {
      await account.update({
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: longToken,
        token_expiry: tokenExpiry,
      });
    }
  }

  return {
    wabaId,
    phoneNumberId,
  };
};
