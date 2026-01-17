const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Send message to chatbot
export const sendChatbotMessage = async (message, interactionCount = 0) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/chatbot/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message, interactionCount })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to send message');
    }

    if (data.success) {
      return {
        message: data.response || data.message || "I'm here to help!",
        suggestions: data.suggestions || []
      };
    }

    throw new Error(data.message || 'Failed to get response');
  } catch (error) {
    console.error('Error in sendChatbotMessage:', error);
    throw error;
  }
};

// Lock chatbot and route to inbox
export const lockChatbot = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/chatbot/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to lock chatbot');
    }

    return data;
  } catch (error) {
    console.error('Error in lockChatbot:', error);
    throw error;
  }
};

