const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Create template
export const createTemplate = async (templateData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(templateData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to create template');
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to create template');
  } catch (error) {
    throw error;
  }
};

// Get all templates
export const getTemplates = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { category, status, page = 1, limit = 20 } = filters;
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    params.append('page', page);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/templates?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch templates');
    }

    if (data.success) {
      return {
        templates: data.templates || [],
        pagination: data.pagination || {}
      };
    }

    throw new Error(data.message || 'Failed to fetch templates');
  } catch (error) {
    throw error;
  }
};

// Get template by ID
export const getTemplateById = async (templateId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/${templateId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch template');
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to fetch template');
  } catch (error) {
    throw error;
  }
};

// Update template
export const updateTemplate = async (templateId, updates) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/${templateId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to update template');
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to update template');
  } catch (error) {
    throw error;
  }
};

// Delete template
export const deleteTemplate = async (templateId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete template');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

// Create template and submit to Meta API
export const createMetaTemplate = async (templateData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(templateData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to create template');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to create template');
  } catch (error) {
    throw error;
  }
};

// Get templates from Meta API
export const getMetaTemplates = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/meta`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch templates from Meta');
    }

    if (data.success) {
      return data.templates || [];
    }

    throw new Error(data.message || 'Failed to fetch templates from Meta');
  } catch (error) {
    throw error;
  }
};

