import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, updateProfile } from '../services/authService';
import { getSettings } from '../services/settingsService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import MainSidebarNav from '../components/MainSidebarNav';

function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationRef = useRef(null);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    email: '',
    countryCode: '+91',
    whatsappNumber: '',
    userName: ''
  });

  const [settings, setSettings] = useState({
    whatsappNumber: '',
    adminName: '',
    adminEmail: ''
  });

  const splitWhatsappNumber = (rawValue) => {
    const cleaned = String(rawValue || '').replace(/\s+/g, '');
    const supportedCodes = ['+91', '+1', '+44', '+971', '+65'];
    const matchedCode = supportedCodes.find((code) => cleaned.startsWith(code));
    if (matchedCode) {
      return {
        countryCode: matchedCode,
        whatsappNumber: cleaned.slice(matchedCode.length)
      };
    }
    return {
      countryCode: '+91',
      whatsappNumber: cleaned.replace(/^\+/, '')
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        setLoadError('');
        const userData = await getProfile();
        setUser(userData);

        let settingsData = null;
        try {
          settingsData = await getSettings();
        } catch (e) {
          console.warn('Settings row not available:', e);
        }

        if (settingsData) {
          setSettings({
            whatsappNumber: settingsData.whatsappNumber || '',
            adminName: settingsData.adminName || '',
            adminEmail: settingsData.adminEmail || ''
          });
        }

        const whatsappSource = settingsData?.whatsappNumber || '';
        const splitNumber = splitWhatsappNumber(whatsappSource);
        const resolvedEmail = userData?.email || settingsData?.adminEmail || '';
        setProfileForm({
          displayName: userData?.name || settingsData?.adminName || '',
          email: resolvedEmail,
          countryCode: splitNumber.countryCode,
          whatsappNumber: splitNumber.whatsappNumber,
          userName: resolvedEmail
        });
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoadError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const fetchNotifications = async (forceRefresh = false) => {
    try {
      setLoadingNotifications(true);
      if (forceRefresh) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const data = await getNotifications();
      const sortedData = (data || []).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      setNotifications(sortedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated()) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (notificationDropdownOpen && isAuthenticated()) {
      fetchNotifications(true);
    }
  }, [notificationDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    setNotificationDropdownOpen(false);
  };

  const handleProfileFormChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({
      ...prev,
      [name]: value
    }));
    setProfileError('');
    setProfileSuccess('');
  };

  const handleProfileEdit = () => {
    setIsProfileEditing(true);
    setProfileError('');
    setProfileSuccess('');
  };

  const handleProfileCancel = () => {
    const restoredWhatsApp = splitWhatsappNumber(settings.whatsappNumber || '');
    const restoredEmail = user?.email || settings.adminEmail || '';
    setProfileForm({
      displayName: user?.name || settings.adminName || '',
      email: restoredEmail,
      countryCode: restoredWhatsApp.countryCode,
      whatsappNumber: restoredWhatsApp.whatsappNumber,
      userName: restoredEmail
    });
    setIsProfileEditing(false);
    setProfileError('');
    setProfileSuccess('');
  };

  const handleProfileSave = async () => {
    setProfileError('');
    setProfileSuccess('');
    setProfileSaving(true);

    try {
      const response = await updateProfile({
        displayName: profileForm.displayName,
        email: profileForm.email,
        countryCode: profileForm.countryCode,
        whatsappNumber: profileForm.whatsappNumber
      });

      const nextUser = response?.user || {};
      setUser(nextUser);
      setSettings((prev) => ({
        ...prev,
        adminName: nextUser?.name || prev.adminName,
        adminEmail: nextUser?.email || prev.adminEmail,
        whatsappNumber: `${profileForm.countryCode}${profileForm.whatsappNumber}`.replace(/\s+/g, '')
      }));

      setProfileForm((prev) => ({
        ...prev,
        displayName: nextUser?.name || prev.displayName,
        email: nextUser?.email || prev.email,
        userName: nextUser?.email || prev.userName
      }));

      setProfileSuccess('Profile updated successfully!');
      setIsProfileEditing(false);
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (profileSaveError) {
      setProfileError(profileSaveError.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 hidden sm:block">AiSensy</h1>
          </Link>
          <span className="text-gray-400 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-gray-600 hidden md:block">Profile</h2>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => {
                const willOpen = !notificationDropdownOpen;
                setNotificationDropdownOpen(willOpen);
                if (willOpen) fetchNotifications(true);
              }}
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition focus:outline-none"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 border-2 border-white shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>

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
                      type="button"
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
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                      <p className="mt-2 text-sm text-gray-500">Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-gray-500">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition border-l-4 ${
                            !notification.is_read ? 'bg-blue-50 border-blue-500' : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium ${
                                  !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                                }`}
                              >
                                {notification.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notification.body}</p>
                              <p className="text-xs text-gray-400 mt-1">{formatTime(notification.created_at)}</p>
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

          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="bg-teal-900 text-white border-r border-teal-800 w-20 h-full shrink-0 flex flex-col overflow-hidden">
          <MainSidebarNav />
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 bg-gray-50">
          <div className="max-w-5xl mx-auto">
        {loadError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{loadError}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Profile</h2>
          {(profileError || profileSuccess) && (
            <div className="mb-4">
              {profileError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                  {profileSuccess}
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col items-center justify-start">
              <div className="w-28 h-28 rounded-full bg-gray-300 text-white flex items-center justify-center text-4xl font-semibold mb-4">
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </div>
              {!isProfileEditing ? (
                <button
                  type="button"
                  onClick={handleProfileEdit}
                  className="text-sm text-teal-700 hover:text-teal-800 font-medium mb-3"
                >
                  Edit
                </button>
              ) : (
                <div className="mb-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleProfileCancel}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {profileSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Logout
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  name="displayName"
                  value={profileForm.displayName}
                  onChange={handleProfileFormChange}
                  disabled={!isProfileEditing}
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm ${
                    isProfileEditing ? 'bg-white border-gray-300' : 'bg-gray-50 border-gray-200'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="text"
                  name="email"
                  value={profileForm.email}
                  onChange={handleProfileFormChange}
                  disabled={!isProfileEditing}
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm ${
                    isProfileEditing ? 'bg-white border-gray-300' : 'bg-gray-50 border-gray-200'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                <div className="grid grid-cols-3 gap-3">
                  <select
                    name="countryCode"
                    value={profileForm.countryCode}
                    onChange={handleProfileFormChange}
                    disabled={!isProfileEditing}
                    className={`px-3 py-2.5 border rounded-lg text-sm ${
                      isProfileEditing ? 'bg-white border-gray-300' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <option value="+91">India (+91)</option>
                    <option value="+1">US (+1)</option>
                    <option value="+44">UK (+44)</option>
                    <option value="+971">UAE (+971)</option>
                    <option value="+65">Singapore (+65)</option>
                  </select>
                  <input
                    type="text"
                    value={profileForm.countryCode}
                    disabled
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    name="whatsappNumber"
                    value={profileForm.whatsappNumber}
                    onChange={handleProfileFormChange}
                    disabled={!isProfileEditing}
                    className={`px-3 py-2.5 border rounded-lg text-sm ${
                      isProfileEditing ? 'bg-white border-gray-300' : 'bg-gray-50 border-gray-200'
                    }`}
                    placeholder="Enter mobile number"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User Name</label>
                <input
                  type="text"
                  value={profileForm.userName}
                  disabled
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value="********"
                  disabled
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Settings;
