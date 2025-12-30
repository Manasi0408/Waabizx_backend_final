import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated } from '../services/authService';
import { getSettings, saveSettings } from '../services/settingsService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';

function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationRef = useRef(null);

  // Settings form data
  const [settings, setSettings] = useState({
    companyName: '',
    whatsappNumber: '',
    timezone: 'Asia/Kolkata',
    adminName: '',
    adminEmail: ''
  });

  // Timezone options
  const timezones = [
    { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'America/New_York (EST)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
    { value: 'Europe/London', label: 'Europe/London (GMT)' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' }
  ];

  // Fetch user profile and settings on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }

        // Fetch user profile
        const userData = await getProfile();
        setUser(userData);

        // Fetch settings
        const settingsData = await getSettings();
        if (settingsData) {
          setSettings({
            companyName: settingsData.companyName || '',
            whatsappNumber: settingsData.whatsappNumber || '',
            timezone: settingsData.timezone || 'Asia/Kolkata',
            adminName: settingsData.adminName || '',
            adminEmail: settingsData.adminEmail || ''
          });
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  // Fetch notifications function
  const fetchNotifications = async (forceRefresh = false) => {
    try {
      console.log('Fetching notifications...', { forceRefresh });
      setLoadingNotifications(true);
      
      // Add a small delay to ensure fresh data if force refresh
      if (forceRefresh) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const data = await getNotifications();
      console.log('Notifications fetched:', data?.length || 0, 'items');
      
      // Sort notifications by created_at DESC (newest first) to ensure latest appear first
      const sortedData = (data || []).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      console.log('Sorted notifications (newest first):', sortedData.map(n => ({ id: n.id, title: n.title, created_at: n.created_at })));
      
      // Always update to ensure latest notifications are shown
      setNotifications(sortedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Fetch notifications on mount
  useEffect(() => {
    if (isAuthenticated()) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  // Refresh notifications when dropdown opens
  useEffect(() => {
    if (notificationDropdownOpen && isAuthenticated()) {
      // Force immediate fetch when dropdown opens
      console.log('Dropdown opened, fetching fresh notifications...');
      fetchNotifications(true);
    }
  }, [notificationDropdownOpen]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await saveSettings(settings);
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    
    // Close dropdown after clicking (like AiSensy)
    setNotificationDropdownOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const formatTime = (dateString) => {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const settingsMenu = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'whatsapp', label: 'WhatsApp Settings', icon: '💬' },
    { id: 'users', label: 'Users & Roles', icon: '👥' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'api', label: 'API & Webhooks', icon: '🔌' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          {/* Logo with Link */}
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 hidden sm:block">AiSensy</h1>
          </Link>
          
          {/* Page Title */}
          <span className="text-gray-400 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-gray-600 hidden md:block">Settings</h2>
        </div>
        
        {/* Right Side Icons */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={async () => {
                const willOpen = !notificationDropdownOpen;
                setNotificationDropdownOpen(willOpen);
                // Always fetch fresh notifications when opening dropdown
                if (willOpen) {
                  // Force refresh when opening dropdown
                  fetchNotifications(true);
                }
              }}
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition focus:outline-none"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <>
                  {/* Red dot indicator */}
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                  {/* Count badge */}
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 border-2 border-white shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>

            {/* Notification Dropdown */}
            {notificationDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[500px] flex flex-col">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={async () => {
                        await handleMarkAllAsRead();
                        fetchNotifications();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1">
                  {loadingNotifications ? (
                    <div className="px-4 py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-500">Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <p className="text-sm text-gray-500">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition border-l-4 ${
                            !notification.is_read 
                              ? 'bg-blue-50 border-blue-500' 
                              : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                              notification.type === 'campaign' ? 'bg-blue-100' :
                              notification.type === 'template' ? 'bg-green-100' :
                              notification.type === 'message' ? 'bg-purple-100' :
                              'bg-gray-100'
                            }`}>
                              {notification.type === 'campaign' && (
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              )}
                              {notification.type === 'template' && (
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              {notification.type === 'message' && (
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                              )}
                              {!['campaign', 'template', 'message'].includes(notification.type) && (
                                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className={`text-sm font-medium ${
                                    !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                                  }`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1"></div>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatTime(notification.created_at)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* User Profile */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center cursor-pointer hover:ring-2 ring-blue-300 transition">
            <span className="text-white font-semibold text-sm">{user?.name?.charAt(0).toUpperCase() || 'U'}</span>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Left Sidebar - Settings Menu */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-73px)]">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Settings</h3>
            <nav className="space-y-1">
              {settingsMenu.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 p-6 md:p-8">
          {/* General Settings */}
          {activeTab === 'general' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">General Settings</h2>
                <p className="text-gray-600">Manage your account and company information</p>
              </div>

              {/* Success/Error Messages */}
              {success && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-600 text-sm">{success}</p>
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {/* Settings Form */}
              <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <div className="space-y-6">
                  {/* Company Name */}
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="companyName"
                      name="companyName"
                      value={settings.companyName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Enter company name"
                    />
                  </div>

                  {/* WhatsApp Number */}
                  <div>
                    <label htmlFor="whatsappNumber" className="block text-sm font-medium text-gray-700 mb-2">
                      WhatsApp Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="whatsappNumber"
                      name="whatsappNumber"
                      value={settings.whatsappNumber}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="+1234567890"
                    />
                    <p className="mt-1 text-xs text-gray-500">Include country code (e.g., +91 for India)</p>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                      Timezone <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="timezone"
                      name="timezone"
                      value={settings.timezone}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    >
                      {timezones.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Admin Name */}
                  <div>
                    <label htmlFor="adminName" className="block text-sm font-medium text-gray-700 mb-2">
                      Admin Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="adminName"
                      name="adminName"
                      value={settings.adminName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Enter admin name"
                    />
                  </div>

                  {/* Admin Email */}
                  <div>
                    <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-2">
                      Admin Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="adminEmail"
                      name="adminEmail"
                      value={settings.adminEmail}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="admin@example.com"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* WhatsApp Settings */}
          {activeTab === 'whatsapp' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">WhatsApp Settings</h2>
                <p className="text-gray-600">Configure your WhatsApp integration</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <p className="text-gray-500">WhatsApp settings coming soon...</p>
              </div>
            </div>
          )}

          {/* Users & Roles */}
          {activeTab === 'users' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Users & Roles</h2>
                <p className="text-gray-600">Manage team members and permissions</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <p className="text-gray-500">Users & Roles management coming soon...</p>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Notifications</h2>
                <p className="text-gray-600">Configure notification preferences</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <p className="text-gray-500">Notification settings coming soon...</p>
              </div>
            </div>
          )}

          {/* Billing */}
          {activeTab === 'billing' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Billing</h2>
                <p className="text-gray-600">Manage your subscription and payment methods</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <p className="text-gray-500">Billing settings coming soon...</p>
              </div>
            </div>
          )}

          {/* API & Webhooks */}
          {activeTab === 'api' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">API & Webhooks</h2>
                <p className="text-gray-600">Manage API keys and webhook configurations</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <p className="text-gray-500">API & Webhooks settings coming soon...</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Settings;

