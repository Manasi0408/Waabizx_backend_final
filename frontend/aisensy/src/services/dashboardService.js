const API_URL = 'https://wabizx.techwhizzc.com/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Get Dashboard Stats
export const getDashboardStats = async (days = 1) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = days && days !== 1 
      ? `${API_URL}/dashboard/stats?days=${days}`
      : `${API_URL}/dashboard/stats`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch dashboard stats');
    }

    if (data.success) {
      return {
        stats: data.stats || {},
        chartData: data.chartData || [],
        activities: data.activities || []
      };
    }

    throw new Error(data.message || 'Failed to fetch dashboard stats');
  } catch (error) {
    throw error;
  }
};

// WhatsApp conversation-based quota (24-hour rolling)
export const getConversationQuota = async (accountId) => {
  const token = getToken();
  if (!token) throw new Error('No token found');

  if (!accountId && accountId !== 0) {
    throw new Error('accountId is required');
  }

  const response = await fetch(`${API_URL}/dashboard/${accountId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Failed to fetch conversation quota');
  }

  return {
    used: data.used ?? 0,
    remaining: data.remaining ?? 0,
    limit: data.limit ?? 0,
    messagesSentToday: data.messagesSentToday ?? 0,
    accountName: data.accountName ?? null,
  };
};

