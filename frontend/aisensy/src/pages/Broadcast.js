import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import { getTemplates, getMetaTemplates } from '../services/templateService';
import MainSidebarNav from '../components/MainSidebarNav';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import {
  uploadCSV,
  getBroadcastContacts,
  validateTemplate,
  createBroadcast
} from '../services/broadcastService';
import { startCampaign } from '../services/campaignService';

function Broadcast() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  
  // Broadcast form state
  const [step, setStep] = useState(1); // 1: Template, 2: Audience, 3: Variables, 4: Review
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [audienceType, setAudienceType] = useState('csv'); // csv, contacts, manual
  const [csvData, setCsvData] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [manualNumbers, setManualNumbers] = useState('');
  const [variableMapping, setVariableMapping] = useState({});
  const [templateVariables, setTemplateVariables] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [campaignName, setCampaignName] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [loadingCSV, setLoadingCSV] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsPagination, setContactsPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [contactsSearch, setContactsSearch] = useState('');
  
  const notificationRef = useRef(null);
  const fileInputRef = useRef(null);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const content = (t.content || '').toLowerCase();
      return name.includes(q) || content.includes(q);
    });
  }, [templates, templateSearch]);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        const userData = await getProfile();
        setUser(userData);
      } catch (error) {
        console.error('Error fetching profile:', error);
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [navigate]);

  // Fetch templates
  useEffect(() => {
    if (isAuthenticated()) {
      fetchTemplates();
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const data = await getTemplates({ status: 'approved' });
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setError('Failed to fetch templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Fetch notifications
  const fetchNotifications = async (forceRefresh = false) => {
    try {
      setLoadingNotifications(true);
      if (forceRefresh) {
        await new Promise(resolve => setTimeout(resolve, 50));
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

  // Fetch contacts
  const fetchContacts = async (page = 1, search = '') => {
    try {
      setLoadingContacts(true);
      const data = await getBroadcastContacts({ page, limit: 50, search });
      setContacts(data.contacts || []);
      setContactsPagination(data.pagination || {});
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoadingContacts(false);
    }
  };

  useEffect(() => {
    if (audienceType === 'contacts' && isAuthenticated()) {
      fetchContacts(1, contactsSearch);
    }
  }, [audienceType, contactsSearch]);

  // Handle CSV upload
  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);
    setLoadingCSV(true);
    setError('');

    try {
      const result = await uploadCSV(file);
      setCsvData(result.data || []);
      setCsvColumns(result.columns || []);
      setSuccess(`CSV uploaded: ${result.count} rows`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to upload CSV');
    } finally {
      setLoadingCSV(false);
    }
  };

  // Handle template selection
  const handleTemplateSelect = async (template) => {
    setSelectedTemplate(template);
    
    // Parse template variables from content
    const content = template.content || '';
    const matches = content.match(/\{\{(\d+)\}\}/g) || [];
    const vars = matches.map(m => {
      const num = parseInt(m.replace(/[{}]/g, ''));
      return { placeholder: m, number: num };
    }).sort((a, b) => a.number - b.number);
    
    setTemplateVariables(vars);
    
    // Auto-map if CSV columns exist
    if (csvColumns.length > 0 && vars.length > 0) {
      const autoMapping = {};
      vars.forEach((v, index) => {
        if (csvColumns[index + 1]) { // Skip phone column
          autoMapping[v.placeholder] = csvColumns[index + 1];
        }
      });
      setVariableMapping(autoMapping);
    }
    
    // Validate template
    try {
      const validation = await validateTemplate(template.name, templateLanguage, variableMapping);
      setValidationResult(validation);
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  // Handle variable mapping change
  const handleVariableMappingChange = async (placeholder, column) => {
    const newMapping = { ...variableMapping, [placeholder]: column };
    setVariableMapping(newMapping);
    
    if (selectedTemplate) {
      try {
        const validation = await validateTemplate(selectedTemplate.name, templateLanguage, newMapping);
        setValidationResult(validation);
      } catch (error) {
        console.error('Validation error:', error);
      }
    }
  };

  // Parse manual numbers
  const parseManualNumbers = () => {
    const numbers = manualNumbers.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove spaces, dashes, parentheses
        const phone = line.replace(/[\s\-\(\)]/g, '');
        return { phone };
      });
    return numbers;
  };

  // Prepare audience data
  const prepareAudienceData = () => {
    if (audienceType === 'csv') {
      return csvData.map(row => {
        const mapped = { phone: row.phone };
        templateVariables.forEach((v, index) => {
          const column = variableMapping[v.placeholder];
          if (column && row[column]) {
            mapped[`var${v.number}`] = row[column];
          }
        });
        return mapped;
      });
    } else if (audienceType === 'contacts') {
      return selectedContacts.map(contact => {
        const mapped = { phone: contact.phone };
        templateVariables.forEach((v) => {
          const field = variableMapping[v.placeholder];
          if (!field) return;
          const val = (contact.customFields && contact.customFields[field] != null)
            ? contact.customFields[field]
            : contact[field];
          if (val != null && val !== '') mapped[`var${v.number}`] = val;
        });
        return mapped;
      });
    } else if (audienceType === 'manual') {
      return parseManualNumbers();
    }
    return [];
  };

  // Create broadcast
  const handleCreateBroadcast = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    // Audience-specific validation (Waabizx-style)
    if (audienceType === 'csv' && (!csvData || csvData.length === 0)) {
      setError('Upload a CSV and make sure it has at least 1 phone number.');
      return;
    }
    if (audienceType === 'contacts' && (!selectedContacts || selectedContacts.length === 0)) {
      setError('Select at least 1 contact (Audience → Contacts).');
      return;
    }
    if (audienceType === 'manual' && parseManualNumbers().length === 0) {
      setError('Add at least 1 phone number in manual list.');
      return;
    }

    const audienceData = prepareAudienceData();
    if (audienceData.length === 0) {
      setError('No audience members found (check your audience selection and phone column).');
      return;
    }

    if (!campaignName.trim()) {
      setError('Please enter a campaign name');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const broadcastData = {
        name: campaignName,
        template_name: selectedTemplate.name,
        template_language: templateLanguage,
        schedule_time: scheduleTime || null,
        audience_type: audienceType,
        audience_data: audienceData,
        variable_mapping: variableMapping,
        segment_tag: null
      };

      const campaign = await createBroadcast(broadcastData);
      
      setSuccess('Broadcast created successfully!');
      
      // Auto-start if not scheduled
      if (!scheduleTime) {
        try {
          await startCampaign(campaign.id);
          setSuccess('Broadcast created and started successfully!');
        } catch (startError) {
          console.error('Error starting campaign:', startError);
          setError(startError.message || 'Broadcast created, but failed to start sending. Check template approval/token/WABA/recipient.');
          // Do not redirect automatically; let user see the error.
          setSaving(false);
          return;
        }
      }
      
      setTimeout(() => {
        navigate('/campaigns');
      }, 2000);
    } catch (error) {
      setError(error.message || 'Failed to create broadcast');
    } finally {
      setSaving(false);
    }
  };

  // Close dropdowns when clicking outside
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
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
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

  const userName = user?.name || 'User';
  const userAvatar = user?.avatar || '';
  const userInitial = userName.charAt(0).toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 flex items-center justify-center">
        <div className="text-center motion-enter">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Broadcast</h2>
          <AdminHeaderProjectSwitch />
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="relative" ref={notificationRef}>
            <button
              onClick={async () => {
                const willOpen = !notificationDropdownOpen;
                setNotificationDropdownOpen(willOpen);
                if (willOpen) {
                  fetchNotifications(true);
                }
              }}
              className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200/80 flex items-center justify-center cursor-pointer hover:from-sky-50 hover:to-sky-100/80 hover:border-sky-200/70 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
              <div className="motion-pop absolute right-0 mt-3 w-80 md:w-96 bg-white rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-100 z-50 max-h-[500px] flex flex-col overflow-hidden ring-1 ring-black/5 origin-top-right">
                <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-gray-50/80">
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
                      className="text-xs text-sky-600 hover:text-sky-700 font-medium transition"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1">
                  {loadingNotifications ? (
                    <div className="px-4 py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600 mx-auto" />
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
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                notification.type === 'campaign'
                                  ? 'bg-blue-100'
                                  : notification.type === 'template'
                                    ? 'bg-green-100'
                                    : notification.type === 'message'
                                      ? 'bg-purple-100'
                                      : 'bg-gray-100'
                              }`}
                            >
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
                                  <p
                                    className={`text-sm font-medium ${
                                      !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                                    }`}
                                  >
                                    {notification.title || notification.message}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body || notification.message}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1" />
                                )}
                              </div>
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

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Collapsible Sidebar */}
        <aside
          className={`bg-sky-950 text-white border-r border-sky-900 h-full shrink-0 flex flex-col overflow-hidden transition-all duration-300 ${
            sidebarOpen ? 'w-20' : 'w-0 md:w-20'
          }`}
        >
          <MainSidebarNav />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
          {error && (
            <div className="motion-enter mb-6 p-4 bg-red-50 border border-red-200/90 text-red-700 rounded-xl shadow-sm ring-1 ring-red-100/50">
              {error}
            </div>
          )}
          {success && (
            <div className="motion-enter mb-6 p-4 bg-green-50 border border-green-200/90 text-green-700 rounded-xl shadow-sm ring-1 ring-green-100/50">
              {success}
            </div>
          )}

          {/* Step Indicator */}
          <div className="motion-enter mb-6 md:mb-8 rounded-2xl border border-gray-100/90 bg-white/80 p-4 md:p-5 shadow-lg shadow-gray-200/30 ring-1 ring-gray-100/80 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold shadow-md transition-transform duration-300 ${
                      step >= s
                        ? 'bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sky-500/35 scale-100'
                        : 'bg-gray-200 text-gray-600 scale-95'
                    }`}
                  >
                    {s}
                  </div>
                  {s < 4 && (
                    <div
                      className={`flex-1 h-1 mx-2 rounded-full transition-colors duration-300 ${
                        step > s ? 'bg-gradient-to-r from-sky-500 to-sky-400' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 text-xs sm:text-sm font-medium text-gray-600">
              <span>Template</span>
              <span>Audience</span>
              <span>Variables</span>
              <span>Review</span>
            </div>
          </div>

          {/* Step 1: Template Selection */}
          {step === 1 && (
            <div className="motion-enter motion-delay-1 relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white shadow-xl shadow-sky-900/[0.06] ring-1 ring-gray-100/80">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-sky-400/15 blur-3xl"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl"
                aria-hidden
              />

              <div className="relative p-6 md:p-8 lg:p-10">
                <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-xl">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-600/90">
                      Step 1 · Template
                    </p>
                    <h3 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                      <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-gray-800 bg-clip-text text-transparent">
                        Choose your message template
                      </span>
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-[15px]">
                      Select an approved WhatsApp template for this broadcast. You’ll pick your audience next, then map any{' '}
                      <code className="rounded bg-sky-50 px-1 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-100">
                        {'{{n}}'}
                      </code>{' '}
                      variables before review.
                    </p>
                  </div>

                  <div className="w-full shrink-0 rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white via-sky-50/40 to-slate-50/90 p-4 shadow-inner ring-1 ring-sky-100/50 lg:w-72">
                    <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <svg className="h-4 w-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                        />
                      </svg>
                      Template language
                    </label>
                    <select
                      value={templateLanguage}
                      onChange={(e) => setTemplateLanguage(e.target.value)}
                      className="w-full cursor-pointer rounded-xl border-2 border-gray-200/90 bg-white/90 px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm outline-none transition-all hover:border-sky-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                    >
                      <option value="en_US">English (US)</option>
                      <option value="en_GB">English (UK)</option>
                      <option value="hi_IN">Hindi</option>
                      <option value="mr_IN">Marathi</option>
                    </select>
                  </div>
                </div>

                <div className="relative mb-6">
                  <svg
                    className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="search"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search by template name or message text…"
                    className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50/80 py-3.5 pl-11 pr-4 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
                  />
                </div>

                {loadingTemplates ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5"
                      >
                        <div className="mb-4 h-3 w-2/3 rounded-full bg-gray-200" />
                        <div className="mb-2 h-16 rounded-xl bg-gray-100" />
                        <div className="h-3 w-1/3 rounded-full bg-gray-100" />
                      </div>
                    ))}
                  </div>
                ) : templates.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gradient-to-b from-slate-50/80 to-white px-6 py-16 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 shadow-inner ring-1 ring-sky-200/60">
                      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-gray-800">No approved templates yet</p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                      Create and submit templates from Manage → Template Message. Once Meta approves them, they’ll show up here.
                    </p>
                    <Link
                      to="/manage"
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-700"
                    >
                      Go to templates
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/50 px-6 py-10 text-center ring-1 ring-amber-100/80">
                    <p className="font-semibold text-amber-900">No templates match “{templateSearch.trim()}”</p>
                    <button
                      type="button"
                      onClick={() => setTemplateSearch('')}
                      className="mt-3 text-sm font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTemplates.map((template) => {
                      const varNums = [...(template.content || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
                      const varCount = new Set(varNums).size;
                      const isSelected = selectedTemplate?.id === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleTemplateSelect(template)}
                          className={`group relative w-full overflow-hidden rounded-2xl border-2 text-left transition-all duration-300 motion-hover-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                            isSelected
                              ? 'border-sky-500 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/40 shadow-lg shadow-sky-500/20 ring-1 ring-sky-200/70'
                              : 'border-gray-100/90 bg-white hover:border-sky-200 hover:shadow-md hover:shadow-sky-500/5'
                          }`}
                        >
                          <span
                            className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r transition-opacity ${
                              isSelected
                                ? 'from-sky-500 via-emerald-500 to-blue-600 opacity-100'
                                : 'from-sky-200/80 via-sky-300/60 to-blue-200/80 opacity-0 group-hover:opacity-100'
                            }`}
                            aria-hidden
                          />
                          <div className="relative p-4 md:p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h4 className="truncate font-bold text-gray-900 md:text-[17px]">{template.name}</h4>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                      template.status === 'approved'
                                        ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80'
                                        : 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80'
                                    }`}
                                  >
                                    {template.status === 'approved' ? (
                                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                                        <path
                                          fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    ) : null}
                                    {template.status}
                                  </span>
                                  {varCount > 0 ? (
                                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100">
                                      {varCount} variable{varCount !== 1 ? 's' : ''}
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200/80">
                                      No variables
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                                  isSelected
                                    ? 'border-sky-500 bg-sky-500 text-white shadow-md shadow-sky-500/30'
                                    : 'border-gray-200 bg-white text-transparent group-hover:border-sky-300'
                                }`}
                                aria-hidden
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl bg-[#e7ffdb] px-3 py-2.5 shadow-sm ring-1 ring-black/[0.04]">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900/60">Preview</p>
                              <p className="mt-1 line-clamp-3 text-left text-[13px] leading-snug text-gray-800">
                                {template.content || '—'}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 flex flex-col items-stretch justify-between gap-4 border-t border-gray-100/90 pt-6 sm:flex-row sm:items-center">
                  <p className="text-sm text-gray-500">
                    {selectedTemplate ? (
                      <>
                        Selected:{' '}
                        <span className="font-semibold text-gray-800">{selectedTemplate.name}</span>
                      </>
                    ) : (
                      <>Select a template to continue.</>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!selectedTemplate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100"
                  >
                    Next: Select audience
                    <span aria-hidden>→</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Audience Selection */}
          {step === 2 && (
            <div className="motion-enter motion-delay-1 rounded-2xl border border-gray-100/90 bg-white p-6 md:p-8 shadow-lg shadow-gray-200/50 ring-1 ring-gray-100/80 motion-hover-lift hover:shadow-xl">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 tracking-tight">Select Audience</h3>
              
              <div className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                  {['csv', 'contacts', 'manual'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAudienceType(type)}
                      className={`px-4 py-3 rounded-xl border-2 font-medium transition-all duration-200 active:scale-[0.98] ${
                        audienceType === type
                          ? 'border-sky-600 bg-sky-50 text-sky-900 shadow-md shadow-sky-500/15'
                          : 'border-gray-200 hover:border-sky-200 hover:bg-sky-50/40 text-gray-700'
                      }`}
                    >
                      <div className="text-sm font-medium capitalize">{type}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CSV Upload */}
              {audienceType === 'csv' && (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-gray-800">Upload CSV File</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <div className="rounded-2xl border-2 border-dashed border-sky-200/90 bg-gradient-to-br from-sky-50/50 to-white p-6 md:p-8 text-center ring-1 ring-sky-100/60 transition-shadow hover:shadow-md hover:border-sky-300/80">
                    <svg className="mx-auto h-10 w-10 text-sky-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600 mb-3">Drop a file here or browse — first rows will be previewed below</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl font-semibold text-sm shadow-md shadow-sky-600/25 hover:bg-sky-700 transition-all duration-200 active:scale-[0.98]"
                    >
                      {csvFile ? csvFile.name : 'Choose CSV File'}
                    </button>
                  </div>

                  {loadingCSV && (
                    <div className="flex items-center gap-2 text-sm text-sky-700 font-medium">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                      Uploading…
                    </div>
                  )}

                  {csvData.length > 0 && (
                    <div className="rounded-2xl border border-gray-100/90 bg-white shadow-sm ring-1 ring-gray-100/80 overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-sky-50/95 to-slate-50/90 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-800">CSV preview</p>
                        <span className="text-xs font-medium text-sky-800/90 bg-white/80 px-2.5 py-1 rounded-full border border-sky-100">
                          {csvData.length} rows · showing first 10
                        </span>
                      </div>
                      <div className="max-h-60 overflow-x-auto overflow-y-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-sky-50/50 sticky top-0 z-[1]">
                            <tr>
                              {csvColumns.map(col => (
                                <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {csvData.slice(0, 10).map((row, idx) => (
                              <tr key={idx} className="hover:bg-sky-50/40 transition-colors">
                                {csvColumns.map(col => (
                                  <td key={col} className="px-4 py-2.5 text-gray-800 whitespace-nowrap max-w-[200px] truncate">
                                    {row[col] || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Contact Selection */}
              {audienceType === 'contacts' && (
                <div className="space-y-4">
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={contactsSearch}
                      onChange={(e) => setContactsSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm bg-white"
                    />
                  </div>

                  {loadingContacts ? (
                    <div className="rounded-2xl border border-gray-100/90 bg-white py-14 text-center shadow-sm ring-1 ring-gray-100/80">
                      <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-sky-200 border-t-sky-600" />
                      <p className="mt-3 text-gray-600 text-sm font-medium">Loading contacts...</p>
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 py-12 px-4 text-center">
                      <p className="text-gray-600 text-sm font-medium">No contacts match your search</p>
                      <p className="text-gray-500 text-xs mt-1">Try a different keyword or clear the search</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-gray-100/90 bg-white shadow-lg shadow-gray-200/30 ring-1 ring-gray-100/80 overflow-hidden flex flex-col max-h-[min(28rem,70vh)]">
                      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-sky-50/95 to-slate-50/90 border-b border-gray-100">
                        <label className="inline-flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedContacts.length === contacts.length && contacts.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContacts([...contacts]);
                              } else {
                                setSelectedContacts([]);
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
                          />
                          <span className="text-sm font-semibold text-gray-800 group-hover:text-sky-800 transition-colors">
                            Select all on this page
                          </span>
                        </label>
                        <span className="text-xs font-medium text-gray-600 bg-white/90 px-2.5 py-1 rounded-full border border-gray-200/80">
                          {contacts.length} shown
                        </span>
                      </div>
                      <ul className="overflow-y-auto divide-y divide-gray-100 min-h-0 flex-1">
                        {contacts.map(contact => {
                          const isSelected = selectedContacts.some(c => c.id === contact.id);
                          const initial = String(contact.name || '?')
                            .trim()
                            .charAt(0)
                            .toUpperCase();
                          return (
                            <li key={contact.id}>
                              <label
                                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 ${
                                  isSelected
                                    ? 'bg-sky-50/70 border-l-[3px] border-l-sky-500'
                                    : 'border-l-[3px] border-l-transparent hover:bg-gray-50/90'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedContacts([...selectedContacts, contact]);
                                    } else {
                                      setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
                                    }
                                  }}
                                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
                                />
                                <div
                                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md ${
                                    isSelected
                                      ? 'bg-gradient-to-br from-sky-500 to-sky-700 shadow-sky-500/30'
                                      : 'bg-gradient-to-br from-slate-400 to-slate-600'
                                  }`}
                                >
                                  {initial}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-gray-900 truncate">{contact.name}</p>
                                  <p className="text-sm text-sky-700/90 font-medium tabular-nums">{contact.phone}</p>
                                  <p className="text-xs text-gray-500 truncate mt-0.5">
                                    {contact.email || '—'}
                                  </p>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100/90 bg-gradient-to-r from-sky-50/80 to-white px-4 py-3 shadow-sm ring-1 ring-sky-100/50">
                    <span className="text-sm font-medium text-gray-700">Selected</span>
                    <span className="text-sm font-bold tabular-nums text-sky-800">
                      {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Manual Numbers */}
              {audienceType === 'manual' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-sm font-semibold text-gray-800">
                      Enter Phone Numbers (one per line)
                    </label>
                    <span className="text-xs font-semibold text-sky-800 bg-sky-100/90 px-2.5 py-1 rounded-full border border-sky-200/80">
                      {parseManualNumbers().length} numbers entered
                    </span>
                  </div>
                  <div className="rounded-2xl border border-gray-100/90 bg-gradient-to-b from-white to-sky-50/20 p-1 shadow-sm ring-1 ring-gray-100/80">
                    <textarea
                      value={manualNumbers}
                      onChange={(e) => setManualNumbers(e.target.value)}
                      placeholder="919822426339&#10;918600137050"
                      className="w-full px-4 py-3 rounded-xl h-40 bg-white/90 border-2 border-transparent focus:border-sky-300 focus:ring-2 focus:ring-sky-400/35 outline-none transition-all text-sm font-mono leading-relaxed resize-y min-h-[10rem]"
                    />
                  </div>
                  <p className="text-xs text-gray-500">One number per line. Country code included (e.g. 91…).</p>
                </div>
              )}

              <div className="mt-6 flex justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-all duration-200 active:scale-[0.98]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const audienceData = prepareAudienceData();
                    if (audienceData.length > 0) {
                      setStep(3);
                    } else {
                      setError('Please select at least one audience member');
                    }
                  }}
                  className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-semibold shadow-md shadow-sky-600/25 hover:bg-sky-700 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
                >
                  Next: Map Variables
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Variable Mapping */}
          {step === 3 && (
            <div className="motion-enter motion-delay-1 rounded-2xl border border-gray-100/90 bg-white p-6 md:p-8 shadow-lg shadow-gray-200/50 ring-1 ring-gray-100/80 motion-hover-lift hover:shadow-xl">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 tracking-tight">Map Template Variables</h3>
              
              {selectedTemplate && (
                <div className="mb-6 p-4 md:p-5 bg-gradient-to-br from-sky-50/80 to-slate-50/60 border border-sky-100/80 rounded-xl ring-1 ring-sky-100/50">
                  <p className="text-sm font-semibold mb-2 text-gray-900">Template: {selectedTemplate.name}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedTemplate.content}</p>
                </div>
              )}

              {templateVariables.length > 0 ? (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Map each template variable to a column/field from your audience data
                  </p>
                  
                  <div className="space-y-4">
                    {templateVariables.map(v => (
                      <div key={v.placeholder} className="flex items-center gap-4">
                        <div className="w-32 text-sm font-medium">{v.placeholder}</div>
                        <div className="flex-1">
                          {audienceType === 'csv' && csvColumns.length > 0 ? (
                            <select
                              value={variableMapping[v.placeholder] || ''}
                              onChange={(e) => handleVariableMappingChange(v.placeholder, e.target.value)}
                              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all cursor-pointer text-sm shadow-sm"
                            >
                              <option value="">Select column...</option>
                              {csvColumns.filter(col => col !== 'phone').map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={variableMapping[v.placeholder] || ''}
                              onChange={(e) => handleVariableMappingChange(v.placeholder, e.target.value)}
                              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all cursor-pointer text-sm shadow-sm"
                            >
                              <option value="">Select field...</option>
                              <option value="name">Name</option>
                              <option value="email">Email</option>
                              <option value="var1">Variable 1</option>
                              <option value="var2">Variable 2</option>
                              <option value="var3">Variable 3</option>
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {validationResult && (
                    <div className={`mt-4 p-4 rounded-lg ${
                      validationResult.validation.isValid
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                      <p className={`text-sm font-medium ${
                        validationResult.validation.isValid ? 'text-green-800' : 'text-yellow-800'
                      }`}>
                        {validationResult.validation.message}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  This template has no variables to map
                </div>
              )}

              <div className="mt-6 flex justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-all duration-200 active:scale-[0.98]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={templateVariables.length > 0 && !validationResult?.validation.isValid}
                  className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-semibold shadow-md shadow-sky-600/25 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
                >
                  Next: Review & Send
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Send */}
          {step === 4 && (
            <div className="motion-enter motion-delay-1 rounded-2xl border border-gray-100/90 bg-white p-6 md:p-8 shadow-lg shadow-gray-200/50 ring-1 ring-gray-100/80 motion-hover-lift hover:shadow-xl">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 tracking-tight">Review & Send</h3>
              
              <div className="space-y-6">
                {/* Campaign Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Campaign Name *</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g., New Year Offer 2026"
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm"
                  />
                </div>

                {/* Schedule */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Schedule (Optional)</label>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty to send immediately</p>
                </div>

                {/* Summary */}
                <div className="p-4 md:p-5 bg-gradient-to-br from-slate-50/90 to-sky-50/40 border border-gray-100/90 rounded-xl ring-1 ring-gray-100/80">
                  <h4 className="font-bold text-gray-900 mb-3">Campaign Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Template:</span>
                      <span className="font-medium">{selectedTemplate?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Language:</span>
                      <span className="font-medium">{templateLanguage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Audience Type:</span>
                      <span className="font-medium capitalize">{audienceType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Recipients:</span>
                      <span className="font-medium">{prepareAudienceData().length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Send Time:</span>
                      <span className="font-medium">{scheduleTime || 'Immediately'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-all duration-200 active:scale-[0.98]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreateBroadcast}
                  disabled={saving || !campaignName.trim()}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold shadow-md shadow-green-600/25 hover:bg-green-700 hover:shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none"
                >
                  {saving ? 'Creating...' : scheduleTime ? 'Schedule Broadcast' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Broadcast;

