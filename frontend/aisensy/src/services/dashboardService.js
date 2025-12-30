const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Get Dashboard Stats
export const getDashboardStats = async (days = 7) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = days && days !== 7 
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

