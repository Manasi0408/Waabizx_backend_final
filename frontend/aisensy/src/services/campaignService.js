const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Create campaign
export const createCampaign = async (campaignData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(campaignData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to create campaign');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to create campaign');
  } catch (error) {
    throw error;
  }
};

// Get all campaigns
export const getCampaigns = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { status, type, page = 1, limit = 10 } = filters;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    params.append('page', page);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/campaigns?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaigns');
    }

    if (data.success) {
      return {
        campaigns: data.campaigns || [],
        pagination: data.pagination || {}
      };
    }

    throw new Error(data.message || 'Failed to fetch campaigns');
  } catch (error) {
    throw error;
  }
};

// Get campaign by ID
export const getCampaignById = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaign');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to fetch campaign');
  } catch (error) {
    throw error;
  }
};

// Update campaign
export const updateCampaign = async (campaignId, updates) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to update campaign');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to update campaign');
  } catch (error) {
    throw error;
  }
};

// Delete campaign
export const deleteCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete campaign');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

// Start campaign
export const startCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to start campaign');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to start campaign');
  } catch (error) {
    throw error;
  }
};

// Pause campaign
export const pauseCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to pause campaign');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to pause campaign');
  } catch (error) {
    throw error;
  }
};

// Resume campaign
export const resumeCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to resume campaign');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to resume campaign');
  } catch (error) {
    throw error;
  }
};

// Get campaign audience logs
export const getCampaignAudience = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/audience`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaign audience');
    }

    if (data.success) {
      return data.audience || [];
    }

    throw new Error(data.message || 'Failed to fetch campaign audience');
  } catch (error) {
    throw error;
  }
};

