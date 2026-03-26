const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api`;

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
export const register = async (name, email, password, mobileNumber) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (API_BASE && API_BASE.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(`${API_URL}/auth/register/request-otp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, email, password, mobileNumber }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    if (data.success) {
      // Do not auto-login; user will sign in from login page
      return data;
    }

    throw new Error(data.message || 'Registration failed');
  } catch (error) {
    throw error;
  }
};

export const verifyRegisterOtp = async (email, otp) => {
  const headers = { 'Content-Type': 'application/json' };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/register/verify-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'OTP verification failed');
  }
  return data;
};

export const resendRegisterOtp = async (email) => {
  const headers = { 'Content-Type': 'application/json' };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/register/resend-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Resend OTP failed');
  }
  return data;
};

// Login user
export const login = async (email, password) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (API_BASE && API_BASE.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    if (data.success && data.token) {
      setToken(data.token);
      console.log('Access Token:', data.token);
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
  try {
    localStorage.removeItem('role');
    localStorage.removeItem('user');
  } catch (e) {}
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

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    if (API_BASE && API_BASE.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'GET',
      headers,
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

export const updateProfile = async (payload) => {
  const token = getToken();
  if (!token) {
    throw new Error('No token found');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const response = await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload || {}),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to update profile');
  }

  if (data.success && data.user) {
    return data;
  }

  throw new Error(data.message || 'Failed to update profile');
};

// Get stored token
export { getToken, setToken, removeToken };

