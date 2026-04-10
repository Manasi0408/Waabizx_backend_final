const API_URL = 'https://wabizx.techwhizzc.com/api';

const getToken = () => {
  return localStorage.getItem('token');
};

// Delete message
export const deleteMessage = async (messageId) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete message');
    return data;
  } catch (error) {
    throw error;
  }
};

// Forward message
export const forwardMessage = async (messageId, contactIds) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/${messageId}/forward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ contactIds })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to forward message');
    return data;
  } catch (error) {
    throw error;
  }
};

// Add reaction
export const addReaction = async (messageId, emoji) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/${messageId}/reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ emoji })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to add reaction');
    return data;
  } catch (error) {
    throw error;
  }
};

// Search messages
export const searchMessages = async (contactId, query, limit = 50, offset = 0) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/search?contactId=${contactId}&query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to search messages');
    return data;
  } catch (error) {
    throw error;
  }
};

// Get paginated messages
export const getPaginatedMessages = async (contactId, page = 1, limit = 50) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/paginated?contactId=${contactId}&page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch messages');
    return data;
  } catch (error) {
    throw error;
  }
};

// Send template message
export const sendTemplateMessage = async (phone, templateName, templateLanguage = 'en_US', templateParams = []) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/send-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phone,
        templateName,
        templateLanguage,
        templateParams
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMsg = data.error || data.msg || data.message || 'Failed to send template';
      console.error('Template send error:', { status: response.status, data });
      throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    }
    return data;
  } catch (error) {
    throw error;
  }
};

