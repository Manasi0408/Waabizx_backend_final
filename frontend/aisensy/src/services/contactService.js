const API_URL = 'https://wabizx.techwhizzc.com/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Create contact
export const createContact = async (contactData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(contactData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to create contact');
    }

    if (data.success) {
      return {
        contact: data.contact,
        message: data.message || '',
        alreadyExists: /already exists/i.test(String(data.message || ''))
      };
    }

    throw new Error(data.message || 'Failed to create contact');
  } catch (error) {
    throw error;
  }
};

// Upload CSV and save to contacts table (campaign flow Step 2)
export const uploadContactsCSV = async (file) => {
  const token = getToken();
  if (!token) throw new Error('No token found');
  const formData = new FormData();
  formData.append('csvFile', file);
  const response = await fetch(`${API_URL}/contacts/upload-csv`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Failed to upload CSV');
  if (!data.success) throw new Error(data.message || 'Failed to upload CSV');
  return data;
};

// Get all contacts
export const getContacts = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { status, type, search, page = 1, limit = 20 } = filters;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (search) params.append('search', search);
    params.append('page', page);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/contacts?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch contacts');
    }

    if (data.success) {
      return {
        contacts: data.contacts || [],
        pagination: data.pagination || {}
      };
    }

    throw new Error(data.message || 'Failed to fetch contacts');
  } catch (error) {
    throw error;
  }
};

// Get contact by ID
export const getContactById = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to fetch contact');
  } catch (error) {
    throw error;
  }
};

// Update contact
export const updateContact = async (contactId, updates) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to update contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to update contact');
  } catch (error) {
    throw error;
  }
};

// Opt-out contact
export const optOutContact = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}/opt-out`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to opt-out contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to opt-out contact');
  } catch (error) {
    throw error;
  }
};

// Opt-in contact
export const optInContact = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}/opt-in`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to opt-in contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to opt-in contact');
  } catch (error) {
    throw error;
  }
};

// Delete contact
export const deleteContact = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete contact');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

