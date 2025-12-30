const axios = require('axios');

exports.sendTextMessage = async ({ phone, text }) => {
  const payload = {
    to: phone,
    type: 'text',
    text: { body: text },
  };

  const response = await axios.post(
    'https://api.aisensy.com/v1/message/send',
    payload,
    {
      headers: {
        Authorization: `Bearer ${process.env.AISENSY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
};
