import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import { getTemplates, getMetaTemplates } from '../services/templateService';
import MainSidebarNav from '../components/MainSidebarNav';
import {
  uploadCSV,
  getBroadcastContacts,
  getSegments,
  getContactsBySegment,
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
  const [audienceType, setAudienceType] = useState('csv'); // csv, contacts, manual, segment
  const [csvData, setCsvData] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [manualNumbers, setManualNumbers] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');
  const [segments, setSegments] = useState([]);
  const [segmentContacts, setSegmentContacts] = useState([]);
  const [variableMapping, setVariableMapping] = useState({});
  const [templateVariables, setTemplateVariables] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [campaignName, setCampaignName] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingCSV, setLoadingCSV] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsPagination, setContactsPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [contactsSearch, setContactsSearch] = useState('');
  
  const notificationRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Fetch segments
  useEffect(() => {
    if (audienceType === 'segment' && isAuthenticated()) {
      fetchSegments();
    }
  }, [audienceType]);

  const fetchSegments = async () => {
    try {
      const segmentsData = await getSegments();
      setSegments(segmentsData);
    } catch (error) {
      console.error('Error fetching segments:', error);
    }
  };

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

  // Handle segment selection
  const handleSegmentSelect = async (tag) => {
    setSelectedSegment(tag);
    try {
      const contacts = await getContactsBySegment(tag);
      setSegmentContacts(contacts);
    } catch (error) {
      setError('Failed to fetch segment contacts');
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
    } else if (audienceType === 'segment') {
      return segmentContacts.map(contact => {
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
    }
    return [];
  };

  // Create broadcast
  const handleCreateBroadcast = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    // Audience-specific validation (AiSensy-style)
    if (audienceType === 'csv' && (!csvData || csvData.length === 0)) {
      setError('Upload a CSV and make sure it has at least 1 phone number.');
      return;
    }
    if (audienceType === 'contacts' && (!selectedContacts || selectedContacts.length === 0)) {
      setError('Select at least 1 contact (Audience → Contacts).');
      return;
    }
    if (audienceType === 'segment' && !selectedSegment) {
      setError('Select a segment/tag first.');
      return;
    }
    if (audienceType === 'segment' && (!segmentContacts || segmentContacts.length === 0)) {
      setError('No contacts found for this segment/tag.');
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
        segment_tag: audienceType === 'segment' ? selectedSegment : null
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          {/* Menu Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 hidden sm:block">AiSensy</h1>
          </Link>
          
          {/* Page Title */}
          <span className="text-gray-400 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-gray-600 hidden md:block">Broadcast</h2>
        </div>
        
        {/* Right Side Icons */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={async () => {
                const willOpen = !notificationDropdownOpen;
                setNotificationDropdownOpen(willOpen);
                if (willOpen) {
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
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
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
                                    {notification.title || notification.message}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body || notification.message}
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
          
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center cursor-pointer hover:ring-2 ring-blue-300 transition focus:outline-none"
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Collapsible Sidebar */}
        <aside
          className={`bg-teal-900 text-white border-r border-teal-800 h-full shrink-0 flex flex-col overflow-hidden transition-all duration-300 ${
            sidebarOpen ? 'w-20' : 'w-0 md:w-20'
          }`}
        >
          <MainSidebarNav />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              {success}
            </div>
          )}

          {/* Step Indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    step >= s ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {s}
                  </div>
                  {s < 4 && (
                    <div className={`flex-1 h-1 mx-2 ${
                      step > s ? 'bg-blue-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Template</span>
              <span>Audience</span>
              <span>Variables</span>
              <span>Review</span>
            </div>
          </div>

          {/* Step 1: Template Selection */}
          {step === 1 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4">Select Template</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Template Language</label>
                <select
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="en_US">English (US)</option>
                  <option value="en_GB">English (UK)</option>
                  <option value="hi_IN">Hindi</option>
                  <option value="mr_IN">Marathi</option>
                </select>
              </div>

              {loadingTemplates ? (
                <div className="text-center py-8">Loading templates...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                        selectedTemplate?.id === template.id
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <h4 className="font-semibold">{template.name}</h4>
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{template.content}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded ${
                          template.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {template.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedTemplate}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Next: Select Audience
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Audience Selection */}
          {step === 2 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4">Select Audience</h3>
              
              <div className="mb-6">
                <div className="grid grid-cols-4 gap-4">
                  {['csv', 'contacts', 'manual', 'segment'].map(type => (
                    <button
                      key={type}
                      onClick={() => setAudienceType(type)}
                      className={`px-4 py-3 rounded-lg border-2 transition ${
                        audienceType === type
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium capitalize">{type}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CSV Upload */}
              {audienceType === 'csv' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Upload CSV File</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {csvFile ? csvFile.name : 'Choose CSV File'}
                  </button>
                  
                  {loadingCSV && <div className="mt-2 text-sm text-gray-600">Uploading...</div>}
                  
                  {csvData.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">CSV Preview ({csvData.length} rows):</p>
                      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              {csvColumns.map(col => (
                                <th key={col} className="px-3 py-2 text-left">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvData.slice(0, 10).map((row, idx) => (
                              <tr key={idx} className="border-t">
                                {csvColumns.map(col => (
                                  <td key={col} className="px-3 py-2">{row[col] || '-'}</td>
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
                <div>
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={contactsSearch}
                      onChange={(e) => setContactsSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  {loadingContacts ? (
                    <div className="text-center py-8">Loading contacts...</div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">
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
                              />
                            </th>
                            <th className="px-3 py-2 text-left">Name</th>
                            <th className="px-3 py-2 text-left">Phone</th>
                            <th className="px-3 py-2 text-left">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contacts.map(contact => (
                            <tr key={contact.id} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedContacts.some(c => c.id === contact.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedContacts([...selectedContacts, contact]);
                                    } else {
                                      setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">{contact.name}</td>
                              <td className="px-3 py-2">{contact.phone}</td>
                              <td className="px-3 py-2">{contact.email || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  <div className="mt-2 text-sm text-gray-600">
                    Selected: {selectedContacts.length} contacts
                  </div>
                </div>
              )}

              {/* Manual Numbers */}
              {audienceType === 'manual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Phone Numbers (one per line)
                  </label>
                  <textarea
                    value={manualNumbers}
                    onChange={(e) => setManualNumbers(e.target.value)}
                    placeholder="919822426339&#10;918600137050"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md h-40"
                  />
                  <div className="mt-2 text-sm text-gray-600">
                    {parseManualNumbers().length} numbers entered
                  </div>
                </div>
              )}

              {/* Segment Selection */}
              {audienceType === 'segment' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Segment (Tag)</label>
                  <select
                    value={selectedSegment}
                    onChange={(e) => handleSegmentSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select segment...</option>
                    {segments.map(segment => (
                      <option key={segment.name} value={segment.name}>
                        {segment.name} ({segment.count} contacts)
                      </option>
                    ))}
                  </select>
                  
                  {segmentContacts.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">
                        {segmentContacts.length} contacts in this segment
                      </p>
                      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left">Phone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {segmentContacts.slice(0, 20).map(contact => (
                              <tr key={contact.id} className="border-t">
                                <td className="px-3 py-2">{contact.name}</td>
                                <td className="px-3 py-2">{contact.phone}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    const audienceData = prepareAudienceData();
                    if (audienceData.length > 0) {
                      setStep(3);
                    } else {
                      setError('Please select at least one audience member');
                    }
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg"
                >
                  Next: Map Variables
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Variable Mapping */}
          {step === 3 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4">Map Template Variables</h3>
              
              {selectedTemplate && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium mb-2">Template: {selectedTemplate.name}</p>
                  <p className="text-sm text-gray-600">{selectedTemplate.content}</p>
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
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

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={templateVariables.length > 0 && !validationResult?.validation.isValid}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Next: Review & Send
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Send */}
          {step === 4 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4">Review & Send</h3>
              
              <div className="space-y-6">
                {/* Campaign Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Campaign Name *</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g., New Year Offer 2026"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                {/* Schedule */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Schedule (Optional)</label>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty to send immediately</p>
                </div>

                {/* Summary */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-3">Campaign Summary</h4>
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

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateBroadcast}
                  disabled={saving || !campaignName.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {saving ? 'Creating...' : scheduleTime ? 'Schedule Broadcast' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Broadcast;

