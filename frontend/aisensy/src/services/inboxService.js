const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Get inbox chat list
export const getInboxList = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/inbox`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch inbox list');
    }

    if (data.success) {
      return data.inbox || [];
    }

    throw new Error(data.message || 'Failed to fetch inbox list');
  } catch (error) {
    throw error;
  }
};

// Get messages of a contact by phone
export const getContactMessages = async (phone) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/inbox/${phone}/messages`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch messages');
    }

    if (data.success) {
      return {
        contact: data.contact,
        messages: data.messages || []
      };
    }

    throw new Error(data.message || 'Failed to fetch messages');
  } catch (error) {
    throw error;
  }
};

// Send message from inbox
export const sendMessage = async (phone, text) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/inbox/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ phone, text })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to send message');
    }

    if (data.success) {
      return data.message;
    }

    throw new Error(data.message || 'Failed to send message');
  } catch (error) {
    throw error;
  }
};

// Mark messages as read for a contact
export const markAsRead = async (phone) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/inbox/${phone}/read`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to mark as read');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

