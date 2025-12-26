import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated } from '../services/authService';
import { getSettings, saveSettings } from '../services/settingsService';

function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
          <div className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
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

