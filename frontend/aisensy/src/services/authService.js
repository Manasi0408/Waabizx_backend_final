const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Set token in localStorage
const setToken = (token) => {
  localStorage.setItem('token', token);
};

// Remove token from localStorage
const removeToken = () => {
  localStorage.removeItem('token');
};

// Register user
export const register = async (name, email, password) => {
  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    if (data.success && data.token) {
      setToken(data.token);
      return data;
    }

    throw new Error(data.message || 'Registration failed');
  } catch (error) {
    throw error;
  }
};

// Login user
export const login = async (email, password) => {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    if (data.success && data.token) {
      setToken(data.token);
      return data;
    }

    throw new Error(data.message || 'Login failed');
  } catch (error) {
    throw error;
  }
};

// Logout user
export const logout = () => {
  removeToken();
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!getToken();
};

// Get user profile
export const getProfile = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch profile');
    }

    if (data.success && data.user) {
      return data.user;
    }

    throw new Error(data.message || 'Failed to fetch profile');
  } catch (error) {
    throw error;
  }
};

// Get stored token
export { getToken, setToken, removeToken };

