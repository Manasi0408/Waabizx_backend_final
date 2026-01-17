const axios = require('axios');

/**
 * Meta Cloud API Service for WhatsApp
 * Sends messages directly via Meta Graph API
 */

// Get environment variables (support multiple naming conventions)
const getPhoneNumberId = () => {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || 
         process.env.PHONE_NUMBER_ID || 
         process.env.WA_PHONE_NUMBER_ID ||
         process.env.Phone_Number_ID;
};

const getAccessToken = () => {
  return process.env.WHATSAPP_TOKEN || 
         process.env.PERMANENT_TOKEN || 
         process.env.WA_ACCESS_TOKEN ||
         process.env.Whatsapp_Token;
};

const getApiVersion = () => {
  return process.env.WHATSAPP_API_VERSION || 'v18.0';
};

/**
 * Send text message via Meta Cloud API
 * @param {string} to - Phone number with country code (e.g., "919822426339")
 * @param {string} body - Message text
 * @returns {Promise} - Meta API response
 */
const sendText = async (to, body) => {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();
  const apiVersion = getApiVersion();

  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured. Please add it to your .env file.');
  }

  if (!accessToken) {
    throw new Error('WHATSAPP_TOKEN is not configured. Please add it to your .env file.');
  }

  // Ensure phone number doesn't have + prefix for Meta API
  const phone = to.toString().trim().replace(/^\+/, '');

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: {
      body: body
    }
  };

  console.log('📤 Sending TEXT message via Meta API:', {
    url,
    to: phone,
    body: body.substring(0, 50) + (body.length > 50 ? '...' : '')
  });

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Meta API TEXT response:', {
      status: response.status,
      messageId: response.data?.messages?.[0]?.id,
      wamid: response.data?.messages?.[0]?.id
    });

    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id,
      wamid: response.data?.messages?.[0]?.id,
      response: response.data
    };
  } catch (error) {
    const errorDetails = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.response?.data?.error?.message || error.message
    };
    
    console.error('❌ Meta API TEXT error:', errorDetails);
    throw new Error(errorDetails.message || 'Failed to send text message via Meta API');
  }
};

/**
 * Send template message via Meta Cloud API
 * @param {string} to - Phone number with country code (e.g., "919822426339")
 * @param {string} templateName - Template name (e.g., "welcome_message")
 * @param {string} languageCode - Language code (default: "en_US")
 * @param {Array} parameters - Optional template parameters
 * @returns {Promise} - Meta API response
 */
const sendTemplate = async (to, templateName, languageCode = 'en_US', parameters = []) => {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();
  const apiVersion = getApiVersion();

  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured. Please add it to your .env file.');
  }

  if (!accessToken) {
    throw new Error('WHATSAPP_TOKEN is not configured. Please add it to your .env file.');
  }

  // Ensure phone number doesn't have + prefix for Meta API
  const phone = to.toString().trim().replace(/^\+/, '');

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      }
    }
  };

  // Add template parameters if provided
  if (parameters && parameters.length > 0) {
    payload.template.components = [
      {
        type: 'body',
        parameters: parameters.map(param => ({
          type: 'text',
          text: param
        }))
      }
    ];
  }

  console.log('📤 Sending TEMPLATE message via Meta API:', {
    url,
    to: phone,
    templateName,
    languageCode,
    hasParameters: parameters.length > 0
  });

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Meta API TEMPLATE response:', {
      status: response.status,
      messageId: response.data?.messages?.[0]?.id,
      wamid: response.data?.messages?.[0]?.id
    });

    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id,
      wamid: response.data?.messages?.[0]?.id,
      response: response.data
    };
  } catch (error) {
    const errorDetails = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.response?.data?.error?.message || error.message
    };
    
    console.error('❌ Meta API TEMPLATE error:', errorDetails);
    throw new Error(errorDetails.message || 'Failed to send template message via Meta API');
  }
};

module.exports = {
  sendText,
  sendTemplate
};

