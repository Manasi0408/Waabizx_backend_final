const axios = require('axios');
const { Client, WhatsAppAccount, User } = require('../models');
const db = require('../config/db');

const APP_ID = process.env.APP_ID || process.env.META_APP_ID;
const APP_SECRET = process.env.APP_SECRET || process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || process.env.META_REDIRECT_URI;
const API_VERSION = 'v19.0';

const graphBase = () => `https://graph.facebook.com/${API_VERSION}`;

/**
 * Meta no longer exposes whatsapp_business_accounts on User /me for many apps.
 * Resolve WABA via assigned_whatsapp_business_accounts, then Business-owned WABAs, then legacy field.
 */
async function resolveWabaAndPhoneFromToken(longToken) {
  const headers = { Authorization: `Bearer ${longToken}` };
  const base = graphBase();

  let wabaId = null;
  let phoneNumberId = null;

  const fetchPhoneForWaba = async (id) => {
    const phoneRes = await axios.get(`${base}/${id}/phone_numbers`, { headers });
    const phoneData = phoneRes.data?.data;
    if (!phoneData || phoneData.length === 0) {
      throw new Error('No phone number found for WABA');
    }
    return phoneData[0].id;
  };

  // 1) Assigned WABAs (documented User edge — replaces me?fields=whatsapp_business_accounts)
  try {
    const assignedRes = await axios.get(`${base}/me/assigned_whatsapp_business_accounts`, {
      headers,
      params: { fields: 'id,name,phone_numbers{id}' },
    });
    const assigned = assignedRes.data?.data;
    if (assigned?.length) {
      wabaId = assigned[0].id;
      phoneNumberId = assigned[0]?.phone_numbers?.data?.[0]?.id || null;
    }
  } catch (e) {
    const code = e?.response?.data?.error?.code;
    if (code === 190 || code === 102) throw e;
  }

  // 2a) Businesses you manage → owned WABAs
  if (!wabaId) {
    try {
      const bizRes = await axios.get(`${base}/me`, {
        headers,
        params: { fields: 'businesses{owned_whatsapp_business_accounts{id}}' },
      });
      const businesses = bizRes.data?.businesses?.data || [];
      for (const b of businesses) {
        const owned = b?.owned_whatsapp_business_accounts?.data;
        if (owned?.length) {
          wabaId = owned[0].id;
          break;
        }
      }
    } catch (e) {
      const code = e?.response?.data?.error?.code;
      if (code === 190 || code === 102) throw e;
    }
  }

  // 2b) Solution-provider / client WABAs on Business
  if (!wabaId) {
    try {
      const bizRes = await axios.get(`${base}/me`, {
        headers,
        params: { fields: 'businesses{client_whatsapp_business_accounts{id}}' },
      });
      const businesses = bizRes.data?.businesses?.data || [];
      for (const b of businesses) {
        const client = b?.client_whatsapp_business_accounts?.data;
        if (client?.length) {
          wabaId = client[0].id;
          break;
        }
      }
    } catch (e) {
      const code = e?.response?.data?.error?.code;
      if (code === 190 || code === 102) throw e;
    }
  }

  // 3) Legacy User field (older Graph behavior)
  if (!wabaId) {
    try {
      const legacyRes = await axios.get(`${base}/me`, {
        headers,
        params: { fields: 'whatsapp_business_accounts{id}' },
      });
      const legacy = legacyRes.data?.whatsapp_business_accounts?.data;
      if (legacy?.length) {
        wabaId = legacy[0].id;
      }
    } catch (e) {
      const code = e?.response?.data?.error?.code;
      if (code === 190 || code === 102) throw e;
    }
  }

  if (!wabaId) {
    throw new Error(
      'No WhatsApp Business Account found for this login. Finish Embedded Signup in Meta, ' +
        'and ensure the app requests whatsapp_business_management (and business_management if needed).'
    );
  }

  if (!phoneNumberId) {
    phoneNumberId = await fetchPhoneForWaba(wabaId);
  }

  return { wabaId, phoneNumberId };
}

exports.resolveWabaAndPhoneFromToken = resolveWabaAndPhoneFromToken;

exports.completeOnboarding = async (code, clientId, selectedProjectId = null, redirectUriOverride = null) => {
  if (!APP_ID || !APP_SECRET) {
    throw new Error('APP_ID and APP_SECRET must be set');
  }

  const effectiveRedirectUri = String(redirectUriOverride || REDIRECT_URI || '').trim();
  if (!effectiveRedirectUri) {
    throw new Error('REDIRECT_URI is not set');
  }

  // 1) Exchange code for short-lived token
  const tokenRes = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token`,
    {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: effectiveRedirectUri,
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

  // 3–4) WABA + phone (Graph no longer supports me.whatsapp_business_accounts on User for many apps)
  const { wabaId, phoneNumberId } = await resolveWabaAndPhoneFromToken(longToken);

  // 5) Save to database (multi-tenant: client + whatsapp_accounts)
  if (clientId != null) {
    let name = '';
    let email = '';
    let ownerProjectId = null;
    try {
      const user = await User.findByPk(clientId, { attributes: ['name', 'email', 'projectId'] });
      if (user) {
        name = user.name || '';
        email = user.email || '';
        ownerProjectId = user.projectId != null ? Number(user.projectId) : null;
      }
    } catch (e) {}
    const linkProjectId =
      selectedProjectId != null && Number(selectedProjectId) > 0
        ? Number(selectedProjectId)
        : ownerProjectId;
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
        projectId: linkProjectId,
      },
    });
    if (!account.isNewRecord) {
      await account.update({
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: longToken,
        token_expiry: tokenExpiry,
        ...(account.projectId == null && linkProjectId != null ? { projectId: linkProjectId } : {}),
      });
    }
    if (linkProjectId != null) {
      try {
        await db.query(
          'UPDATE projects SET whatsapp_number_id = ? WHERE id = ?',
          [phoneNumberId, linkProjectId]
        );
      } catch (e) {
        const msg = e?.message || '';
        if (msg.includes('Unknown column')) {
          try {
            await db.query('ALTER TABLE projects ADD COLUMN whatsapp_number_id VARCHAR(100) NULL');
            await db.query(
              'UPDATE projects SET whatsapp_number_id = ? WHERE id = ?',
              [phoneNumberId, linkProjectId]
            );
          } catch (retryErr) {
            console.error('Could not map project to phone_number_id:', retryErr?.message || retryErr);
          }
        } else {
          console.error('Could not map project to phone_number_id:', msg || e);
        }
      }
    }
  }

  return {
    wabaId,
    phoneNumberId,
    clientId: clientId != null ? Number(clientId) : null,
    projectId:
      selectedProjectId != null && Number(selectedProjectId) > 0
        ? Number(selectedProjectId)
        : null,
    onboardingCompleted: true,
    linkedAt: new Date().toISOString(),
  };
};

exports.getOnboardingStatus = async (clientId, selectedProjectId = null) => {
  if (clientId == null || Number.isNaN(Number(clientId))) {
    return {
      onboardingCompleted: false,
      reason: 'Invalid clientId',
    };
  }

  const where = { client_id: Number(clientId) };
  if (selectedProjectId != null && Number(selectedProjectId) > 0) {
    where.projectId = Number(selectedProjectId);
  }

  const account = await WhatsAppAccount.findOne({
    where,
    attributes: ['id', 'client_id', 'projectId', 'waba_id', 'phone_number_id', 'token_expiry', 'created_at'],
    order: [['id', 'DESC']],
  });

  if (!account) {
    return {
      onboardingCompleted: false,
      reason: 'No WhatsApp account mapping found',
      clientId: Number(clientId),
      projectId: selectedProjectId != null ? Number(selectedProjectId) : null,
    };
  }

  const wabaId = String(account.waba_id || '').trim();
  const phoneNumberId = String(account.phone_number_id || '').trim();
  const onboardingCompleted = Boolean(wabaId && phoneNumberId);

  return {
    onboardingCompleted,
    clientId: Number(account.client_id),
    projectId: account.projectId != null ? Number(account.projectId) : null,
    wabaId: wabaId || null,
    phoneNumberId: phoneNumberId || null,
    tokenExpiry: account.token_expiry || null,
    linkedAt: account.created_at || null,
    reason: onboardingCompleted ? null : 'Incomplete WhatsApp linkage data',
  };
};
