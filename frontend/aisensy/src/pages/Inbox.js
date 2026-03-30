import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InfiniteScroll from 'react-infinite-scroll-component';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { getNotifications, markAsRead as markNotificationAsRead, markAllAsRead } from '../services/notificationService';
import { getInboxList, getContactMessages, sendMessage, markAsRead } from '../services/inboxService';
import { getInboundMessages, sendMetaMessage, getAllMetaMessages, getWebhookLogs } from '../services/metaMessageService';
import { initializeSocket, disconnectSocket, joinContactRoom, leaveContactRoom, sendTypingStart, sendTypingStop, onSocketEvent, offSocketEvent } from '../services/socketService';
import { deleteMessage, forwardMessage, addReaction, searchMessages, getPaginatedMessages, sendTemplateMessage } from '../services/messageService';
import { uploadMedia, sendMediaMessage } from '../services/mediaService';
import { updateContact, getContactHistory, updateTypingStatus, updateOnlineStatus } from '../services/contactManagementService';
import { sendChatbotMessage } from '../services/chatbotService';
import { getTemplates } from '../services/templateService';
import { getManagerRequesting, assignChatToAgent, interveneByPhone } from '../api/chatApi';
import axios from '../api/axios';
import MainSidebarNav from '../components/MainSidebarNav';

function Inbox() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [inboxList, setInboxList] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [interveneCannedOptions, setInterveneCannedOptions] = useState([]);
  const [interveneTemplateOptions, setInterveneTemplateOptions] = useState([]);
  const [loadingInterveneOptions, setLoadingInterveneOptions] = useState(false);
  const [interveneOptionsError, setInterveneOptionsError] = useState('');
  const [selectedInterveneCannedId, setSelectedInterveneCannedId] = useState('');
  const [selectedInterveneTemplateId, setSelectedInterveneTemplateId] = useState('');
  const interveneOptionsLoadedRef = useRef(false);
  const [interveneQuickPickerOpen, setInterveneQuickPickerOpen] = useState(false);
  const interveneQuickPickerRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [typingContacts, setTypingContacts] = useState({});
  const [onlineContacts, setOnlineContacts] = useState({});
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageMenu, setShowMessageMenu] = useState(null);
  const [showContactMenu, setShowContactMenu] = useState(null);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [showContactEditDialog, setShowContactEditDialog] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [botFlowState, setBotFlowState] = useState({}); // { phone: flowState }
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [requestingList, setRequestingList] = useState([]);
  const [loadingRequesting, setLoadingRequesting] = useState(false);
  const [agentsList, setAgentsList] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [interventionAlert, setInterventionAlert] = useState(null);
  const [intervenedPhones, setIntervenedPhones] = useState({});
  const notificationRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
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

  const isAdminOrManager = user && ['admin', 'manager'].includes(String(user.role || '').toLowerCase());

  const fetchRequesting = useCallback(async () => {
    if (!isAdminOrManager) return;
    setLoadingRequesting(true);
    try {
      const data = await getManagerRequesting();
      setRequestingList(Array.isArray(data) ? data : []);
    } catch (e) {
      setRequestingList([]);
    } finally {
      setLoadingRequesting(false);
    }
  }, [isAdminOrManager]);

  const fetchAgentsForAssign = useCallback(async () => {
    if (!isAdminOrManager) return;
    setLoadingAgents(true);
    try {
      const res = await axios.get('/auth/agents');
      setAgentsList(res.data?.agents || []);
    } catch (e) {
      setAgentsList([]);
    } finally {
      setLoadingAgents(false);
    }
  }, [isAdminOrManager]);

  useEffect(() => {
    if (isAdminOrManager) {
      fetchRequesting();
      fetchAgentsForAssign();
    }
  }, [isAdminOrManager, fetchRequesting, fetchAgentsForAssign]);

  const handleAssignToAgent = async (conversationId, agentId) => {
    if (!conversationId || !agentId) return;
    setAssigningId(conversationId);
    try {
      const result = await assignChatToAgent(conversationId, agentId);
      if (result?.success !== false && !result?.error) {
        await fetchRequesting();
      } else {
        alert(result?.message || result?.error || 'Assign failed');
      }
    } catch (e) {
      alert(e?.message || 'Failed to assign');
    } finally {
      setAssigningId(null);
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

  // Initialize Socket.IO when user is loaded
  useEffect(() => {
    if (isAuthenticated() && user) {
      const token = localStorage.getItem('token');
      const socket = initializeSocket(user.id, token);

      // Set up socket event listeners
      const handleNewMessage = async (message) => {
        console.log('📨 Socket: new-message received', message);
        
        // Check if this message is for the currently selected contact
        const isForSelectedContact = selectedContact && (
          message.contactId === selectedContact.id || 
          message.phone === selectedContact.phone ||
          (selectedContact.phone && message.phone && selectedContact.phone.replace(/\D/g, '') === message.phone.replace(/\D/g, ''))
        );

        if (isForSelectedContact) {
          // Check if bot flow is active and this is an incoming message
          const phone = selectedContact.phone;
          const currentFlowState = botFlowState[phone];
          
          // Auto-respond to incoming messages if bot flow is active
          if (message.type === 'incoming' && currentFlowState && currentFlowState !== 'completed') {
            // Wait a bit before responding (simulate bot thinking)
            setTimeout(async () => {
              try {
                if (currentFlowState === 'template_sent') {
                  // User responded to template - ask for salary
                  const response = await sendChatbotMessage('__YES_CLICKED__', 0, currentFlowState);
                  
                  // Send bot response as message
                  const botResponseText = response.message || "Great! To help you better, could you please tell me your current salary? (Please enter numbers only, e.g., 50000)";
                  await sendMessage(phone, botResponseText);
                  
                  // Update flow state
                  setBotFlowState(prev => ({
                    ...prev,
                    [phone]: response.flowState || 'asking_salary'
                  }));
                } else if (currentFlowState === 'asking_salary' || currentFlowState === 'salary_retry') {
                  // User sent salary - validate it
                  const userMessageText = message.content || '';
                  const response = await sendChatbotMessage(`__SALARY_INPUT__:${userMessageText}`, 0, currentFlowState);
                  
                  if (response.isValid === false) {
                    // Invalid salary - ask again
                    await sendMessage(phone, response.message || "Please enter a valid salary amount. It should be a positive number (e.g., 50000).");
                    setBotFlowState(prev => ({
                      ...prev,
                      [phone]: 'salary_retry'
                    }));
                  } else {
                    // Valid salary - continue flow
                    await sendMessage(phone, response.message || "Thank you! Your information has been recorded. How else can I help you?");
                    setBotFlowState(prev => ({
                      ...prev,
                      [phone]: response.flowState || 'completed'
                    }));
                  }
                }
              } catch (error) {
                console.error('Error in auto bot response:', error);
              }
            }, 1000); // 1 second delay
          }
          
          setMessages(prev => {
            // Normalize content and phone for comparison
            const normalizeContent = (content) => {
              return String(content || '').trim().replace(/\s+/g, ' ');
            };
            const normalizePhone = (phone) => {
              return String(phone || '').replace(/\D/g, '');
            };
            
            const msgContent = normalizeContent(message.content);
            const msgPhone = normalizePhone(message.phone || selectedContact?.phone || '');
            const msgContactId = String(message.contactId || '');
            const msgTimestamp = new Date(message.sentAt || message.createdAt || 0).getTime();
            
            // Check if message already exists (by ID, waMessageId, or content+timestamp+contact)
            const exists = prev.find(m => {
              // Exact ID match (most reliable)
              if (m.id === message.id && message.id) return true;
              
              // Match by waMessageId if available (WhatsApp message ID is globally unique)
              if (m.waMessageId && message.waMessageId && m.waMessageId === message.waMessageId) {
                return true;
              }
              
              // For incoming messages: very strict matching to prevent duplicates
              if (message.type === 'incoming' && m.type === 'incoming') {
                const mContent = normalizeContent(m.content);
                const mPhone = normalizePhone(m.phone || selectedContact?.phone || '');
                const mContactId = String(m.contactId || '');
                const mTimestamp = new Date(m.sentAt || m.createdAt || 0).getTime();
                
                // Check if content matches (normalized)
                if (mContent === msgContent) {
                  // Check if same contact (by ID, phone, or normalized phone)
                  const sameContact = 
                    mContactId === msgContactId || 
                    mPhone === msgPhone ||
                    (mPhone && msgPhone && mPhone === msgPhone);
                  
                  if (sameContact) {
                    // Check if timestamp is close (within 60 seconds - increased window for socket events)
                    const timeDiff = Math.abs(mTimestamp - msgTimestamp);
                    if (timeDiff < 60000) {
                      console.log('🔄 Socket: Incoming message duplicate detected:', {
                        existingId: m.id,
                        newId: message.id,
                        content: msgContent.substring(0, 30),
                        timeDiff: timeDiff,
                        existingSource: m.source,
                        newSource: message.source
                      });
                      return true; // Duplicate found
                    }
                  }
                }
              }
              
              // For outgoing messages: match by content + time (to replace optimistic messages)
              if (message.type === 'outgoing' && m.type === 'outgoing') {
                const mContent = normalizeContent(m.content);
                if (mContent === msgContent) {
                  const mTimestamp = new Date(m.sentAt || m.createdAt || 0).getTime();
                  const timeDiff = Math.abs(mTimestamp - msgTimestamp);
                  if (timeDiff < 10000) return true; // Within 10 seconds
                }
                
                // Also match by waMessageId for outgoing
                if (m.waMessageId && message.waMessageId && m.waMessageId === message.waMessageId) {
                  return true;
                }
              }
              
              return false;
            });
            
            if (exists) {
              // Update existing message (replace optimistic with real one OR prevent duplicate)
              console.log('🔄 Socket: Duplicate message detected - preventing duplicate:', {
                messageId: message.id,
                type: message.type,
                content: msgContent.substring(0, 30),
                waMessageId: message.waMessageId
              });
              
              // For incoming messages: just return prev (don't add duplicate)
              if (message.type === 'incoming') {
                return prev;
              }
              
              // For outgoing messages: update optimistic with real data
              return prev.map(m => {
                // Match by ID
                if (m.id === message.id) {
                  // Preserve template content if it's a template message
                  const updatedMessage = { ...message, isOptimistic: false, source: 'socket' };
                  if (m.isTemplate && m.templateName && message.content?.startsWith('Template:')) {
                    updatedMessage.content = m.content; // Keep the actual template content
                    updatedMessage.isTemplate = true;
                    updatedMessage.templateName = m.templateName;
                  }
                  return updatedMessage;
                }
                
                // Match optimistic message by content + time or waMessageId (for templates)
                if (m.isOptimistic && message.type === 'outgoing') {
                  const contentMatch = m.content === message.content;
                  const waMessageIdMatch = m.waMessageId && message.waMessageId && m.waMessageId === message.waMessageId;
                  const templateMatch = m.isTemplate && message.content?.startsWith('Template:') && m.templateName;
                  
                  if (contentMatch || waMessageIdMatch || templateMatch) {
                    const timeDiff = Math.abs(
                      new Date(m.sentAt || m.createdAt) - new Date(message.sentAt || message.createdAt)
                    );
                    if (timeDiff < 5000) {
                      // Preserve template content if it's a template message
                      const updatedMessage = { ...message, isOptimistic: false, source: 'socket' };
                      if (m.isTemplate && m.templateName && message.content?.startsWith('Template:')) {
                        updatedMessage.content = m.content; // Keep the actual template content
                        updatedMessage.isTemplate = true;
                        updatedMessage.templateName = m.templateName;
                      }
                      return updatedMessage;
                    }
                  }
                }
                
                // Also update by waMessageId for template messages
                if (m.isTemplate && message.waMessageId && m.waMessageId === message.waMessageId) {
                  return { ...m, ...message, content: m.content, isOptimistic: false, source: 'socket' };
                }
                
                return m;
              }).sort((a, b) => {
                const dateA = new Date(a.sentAt || a.createdAt || 0);
                const dateB = new Date(b.sentAt || b.createdAt || 0);
                return dateA - dateB;
              });
            }
            
            // Message doesn't exist - add it (but double-check for duplicates first)
            // Final check: make sure we're not adding a duplicate by content+time+contact
            const isDuplicate = prev.some(m => {
              if (message.type === 'incoming' && m.type === 'incoming') {
                const mContent = normalizeContent(m.content);
                const mPhone = normalizePhone(m.phone || selectedContact?.phone || '');
                const mContactId = String(m.contactId || '');
                const mTimestamp = new Date(m.sentAt || m.createdAt || 0).getTime();
                
                if (mContent === msgContent) {
                  const sameContact = 
                    mContactId === msgContactId || 
                    mPhone === msgPhone ||
                    (mPhone && msgPhone && mPhone === msgPhone);
                  
                  if (sameContact) {
                    const timeDiff = Math.abs(mTimestamp - msgTimestamp);
                    if (timeDiff < 60000) {
                      console.log('🔄 Socket: Final duplicate check - preventing duplicate:', {
                        existingId: m.id,
                        newId: message.id,
                        content: msgContent.substring(0, 30)
                      });
                      return true;
                    }
                  }
                }
              }
              return false;
            });
            
            if (isDuplicate) {
              console.log('🔄 Socket: Duplicate prevented at final check');
              return prev;
            }
            
            // Message is truly new - add it
            console.log('➕ Adding new message from socket:', {
              messageId: message.id,
              type: message.type,
              content: msgContent.substring(0, 30),
              waMessageId: message.waMessageId
            });
            return [...prev, { ...message, isOptimistic: false, source: 'socket' }].sort((a, b) => {
              const dateA = new Date(a.sentAt || a.createdAt || 0);
              const dateB = new Date(b.sentAt || b.createdAt || 0);
              return dateA - dateB;
            });
          });
        } else {
          console.log('📬 Message received for different contact, updating inbox list');
        }
        
        // Always refresh inbox list when new message arrives
        fetchInboxList(false);
      };

      const handleStatusUpdate = (data) => {
        console.log('📊 Socket: message-status-update received', data);
        setMessages(prev => prev.map(msg => 
          msg.id === data.messageId || msg.waMessageId === data.waMessageId
            ? { ...msg, status: data.status, deliveredAt: data.deliveredAt, readAt: data.readAt }
            : msg
        ));
      };

      const handleTyping = (data) => {
        setTypingContacts(prev => ({
          ...prev,
          [data.contactId]: data.isTyping
        }));
      };

      const handleOnlineStatus = (data) => {
        setOnlineContacts(prev => ({
          ...prev,
          [data.contactId]: { isOnline: data.isOnline, lastSeen: data.lastSeen }
        }));
      };

      const handleInboxUpdate = () => {
        fetchInboxList(false);
      };

      onSocketEvent('new-message', handleNewMessage);
      onSocketEvent('message-status-update', handleStatusUpdate);
      onSocketEvent('typing', handleTyping);
      onSocketEvent('online-status', handleOnlineStatus);
      onSocketEvent('inbox-update', handleInboxUpdate);
      const handleIntervention = (data) => {
        setInterventionAlert(data);
        setTimeout(() => setInterventionAlert(null), 6000);
      };
      onSocketEvent('intervention', handleIntervention);

      return () => {
        offSocketEvent('new-message', handleNewMessage);
        offSocketEvent('message-status-update', handleStatusUpdate);
        offSocketEvent('typing', handleTyping);
        offSocketEvent('online-status', handleOnlineStatus);
        offSocketEvent('inbox-update', handleInboxUpdate);
        offSocketEvent('intervention', handleIntervention);
        disconnectSocket();
      };
    }
  }, [user, selectedContact]);

  useEffect(() => {
    if (notificationDropdownOpen && isAuthenticated()) {
      fetchNotifications(true);
    }
  }, [notificationDropdownOpen]);

  // Track last message timestamp for polling
  const lastMessageTimeRef = useRef(null);
  
  // Track if we're currently fetching to prevent duplicate calls and blinking
  const fetchingInboxRef = useRef(false);
  const fetchingInboundRef = useRef(false);
  const fetchingMessagesRef = useRef(false);
  
  // Fetch inbox list
  const fetchInboxList = async (showLoading = false) => {
    // Prevent duplicate calls
    if (fetchingInboxRef.current) {
      return;
    }
    
    try {
      fetchingInboxRef.current = true;
      if (showLoading) {
        setLoadingInbox(true);
      }
      const data = await getInboxList();
      console.log('Inbox list fetched:', data?.length || 0, 'contacts');

      // Persist intervene state from backend chat status across refresh/navigation.
      const nextIntervened = {};
      (data || []).forEach((item) => {
        const status = String(item?.chatStatus || '').toLowerCase();
        if (status === 'intervened' && item?.phone) {
          nextIntervened[item.phone] = true;
        }
      });
      setIntervenedPhones(nextIntervened);
      
      // Only update state if data actually changed (prevent unnecessary re-renders)
      setInboxList(prev => {
        const prevStr = JSON.stringify(prev);
        const newStr = JSON.stringify(data || []);
        if (prevStr !== newStr) {
          return data || [];
        }
        return prev; // Return same reference if no change
      });
    } catch (error) {
      console.error('Error fetching inbox list:', error);
      // Only set empty array on error if we don't have data
      setInboxList(prev => prev.length === 0 ? [] : prev);
    } finally {
      if (showLoading) {
        setLoadingInbox(false);
      }
      fetchingInboxRef.current = false;
    }
  };

  // Fetch inbound messages from metaMessage API
  const fetchInboundMessages = async () => {
    // Prevent duplicate calls
    if (fetchingInboundRef.current) {
      return;
    }
    
    try {
      fetchingInboundRef.current = true;
      const since = lastMessageTimeRef.current ? new Date(lastMessageTimeRef.current).toISOString() : null;
      // Fetch more messages to ensure we get all new ones
      const inboundMessages = await getInboundMessages(500, null, since); // Increased limit
      
      if (inboundMessages && inboundMessages.length > 0) {
        // Update last message time
        const latestMessage = inboundMessages[0];
        if (latestMessage.received_at) {
          lastMessageTimeRef.current = latestMessage.received_at;
        }

        // Refresh inbox list to show new messages (without loading state)
        fetchInboxList(false);

        // If we have a selected contact and new message is for them, refresh messages
        // But only if we're not already fetching (prevent race condition with socket)
        if (selectedContact && !fetchingMessagesRef.current) {
          const hasNewMessage = inboundMessages.some(msg => msg.phone === selectedContact.phone);
          if (hasNewMessage) {
            // Small delay to let socket events process first (socket is faster)
            setTimeout(() => {
              if (!fetchingMessagesRef.current) {
                fetchMessages(selectedContact.phone, false); // false = don't show loading
              }
            }, 500); // 500ms delay
          }
        }
      }
    } catch (error) {
      console.error('Error fetching inbound messages:', error);
    } finally {
      fetchingInboundRef.current = false;
    }
  };

  useEffect(() => {
    if (!loading && isAuthenticated()) {
      // Initial load with loading state
      fetchInboxList(true);
      fetchInboundMessages();
      
      // Refresh inbox list every 15 seconds (background refresh, no loading state)
      const inboxInterval = setInterval(() => fetchInboxList(false), 15000);
      
      // Poll for inbound messages every 10 seconds (reduced frequency)
      const inboundInterval = setInterval(fetchInboundMessages, 10000);
      
      return () => {
        clearInterval(inboxInterval);
        clearInterval(inboundInterval);
      };
    }
  }, [loading]);

  // Fetch messages for selected contact - integrates data from Message, MetaMessage, and WebhookLogs
  const fetchMessages = async (phone, showLoading = true) => {
    if (!phone) {
      console.error('No phone number provided to fetchMessages');
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
      return;
    }

    // Prevent duplicate calls
    if (fetchingMessagesRef.current) {
      console.log('Already fetching messages, skipping duplicate call');
      return;
    }

    // Set a timeout to ensure loading state is cleared even if fetch hangs
    const timeoutId = setTimeout(() => {
      if (fetchingMessagesRef.current) {
        console.warn('fetchMessages timeout - clearing loading state');
        setLoadingMessages(false);
        fetchingMessagesRef.current = false;
      }
    }, 30000); // 30 second timeout

    try {
      fetchingMessagesRef.current = true;
      if (showLoading) {
        setLoadingMessages(true);
      }
      let allMessages = [];
      let contactData = null;
      
      // 1. Get messages from Message table (existing inbox messages)
      // Handle case where contact might not exist yet
      try {
        const data = await getContactMessages(phone);
        allMessages = data.messages || [];
        contactData = data.contact;
        if (data.contact) {
          setSelectedContact(data.contact);
        }
      } catch (error) {
        // Contact might not exist yet - that's okay, we'll still fetch meta messages
        console.log('Contact not found in Message table, will fetch from meta_messages:', error.message);
        // Set a basic contact object from phone number only if we don't have a selected contact
        if (!selectedContact || selectedContact.phone !== phone) {
          setSelectedContact({
            phone: phone,
            name: phone,
            id: null
          });
        }
      }
      
      // 2. Get all meta messages (inbound + outbound) for this phone
      // Fetch all messages (no limit or very high limit)
      try {
        console.log('Fetching meta messages for phone:', phone);
        const metaMessages = await getAllMetaMessages(phone, 10000); // Increased limit to fetch all
        console.log('Meta messages received:', metaMessages?.length || 0, metaMessages);
        
        if (metaMessages && metaMessages.length > 0) {
          // Convert meta messages to inbox message format
          const convertedMetaMessages = metaMessages.map(metaMsg => ({
            id: `meta_${metaMsg.id}`,
            content: metaMsg.text || metaMsg.message_text || '',
            type: metaMsg.direction === 'inbound' ? 'incoming' : 'outgoing',
            status: metaMsg.status === 'received' ? 'delivered' : metaMsg.status,
            sentAt: metaMsg.created_at,
            createdAt: metaMsg.created_at,
            metaMessageId: metaMsg.id,
            messageType: metaMsg.message_type,
            source: 'meta_message'
          }));
          
          // Merge meta messages with existing messages
          allMessages = [...allMessages, ...convertedMetaMessages];
        }
      } catch (error) {
        console.error('Error fetching meta messages:', error);
      }
      
      // 3. Get webhook logs for this phone (for debugging/display)
      // Fetch all webhook logs (increased limit)
      try {
        console.log('Fetching webhook logs for phone:', phone);
        const webhookLogs = await getWebhookLogs(1000, 'message_received', phone); // Increased limit to fetch all
        console.log('Webhook logs received:', webhookLogs?.length || 0, webhookLogs);
        
        if (webhookLogs && webhookLogs.length > 0) {
          // Convert webhook logs to message format (only for message_received events)
          const convertedWebhookMessages = webhookLogs
            .filter(log => {
              try {
                const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
                return payload.event === 'message_received' && payload.from === phone;
              } catch (e) {
                return false;
              }
            })
            .map(log => {
              try {
                const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
                return {
                  id: `webhook_${log.id}`,
                  content: payload?.message?.text || '',
                  type: 'incoming',
                  status: 'delivered',
                  sentAt: log.received_at || log.created_at,
                  createdAt: log.received_at || log.created_at,
                  webhookLogId: log.id,
                  eventType: log.event_type,
                  source: 'webhook_log',
                  rawPayload: payload
                };
              } catch (e) {
                return null;
              }
            })
            .filter(msg => msg !== null);
          
          // Merge webhook messages with existing messages
          allMessages = [...allMessages, ...convertedWebhookMessages];
        }
      } catch (error) {
        console.error('Error fetching webhook logs:', error);
      }
      
      // 4. Merge with existing optimistic messages (preserve messages that haven't been confirmed by server yet)
      setMessages(prev => {
        // Get optimistic messages (messages that are not yet confirmed by server)
        // Only keep optimistic messages for the current contact
        const optimisticMessages = prev.filter(m => 
          (m.isOptimistic || m.source === 'optimistic') && 
          (m.phone === phone || !m.phone) // Keep optimistic messages for current contact or messages without phone
        );
        
        // Create a copy of allMessages to avoid mutating the outer variable
        let processedMessages = allMessages.map((msg, index) => {
          // Ensure content field exists (convert from message field if needed)
          const messageContent = msg.content || msg.message || '';
          
          if (!msg.id) {
            // Generate a unique ID if missing
            const timestamp = new Date(msg.sentAt || msg.createdAt || Date.now()).getTime();
            const source = msg.source || 'message';
            return { ...msg, id: `${source}_${timestamp}_${index}`, content: messageContent };
          }
          return { ...msg, content: messageContent };
        });
        
        // Combine fetched messages with optimistic messages
        const combinedMessages = [...processedMessages, ...optimisticMessages];
        
        // Helper function to determine message priority (lower = higher priority)
        const getMessagePriority = (msg) => {
          if (msg.waMessageId) return 1; // WhatsApp message ID is most reliable
          if (!msg.source || msg.source === 'message' || msg.source === 'socket') return 2; // Message table
          if (msg.source === 'inbox_message') return 3; // InboxMessage table
          if (msg.source === 'meta_message') return 4; // Meta messages
          if (msg.source === 'webhook_log') return 5; // Webhook logs
          return 6; // Other sources
        };
        
        // Normalize content for comparison
        const normalizeContent = (content) => {
          return String(content || '').trim().replace(/\s+/g, ' ');
        };
        
        // Normalize phone for comparison
        const normalizePhone = (phone) => {
          return String(phone || '').replace(/\D/g, '');
        };
        
        // Sort all messages by timestamp first
        combinedMessages.sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        // Use a Map for efficient deduplication
        const messageMap = new Map();
        const currentPhone = normalizePhone(selectedContact?.phone || phone || '');
        
        for (const msg of combinedMessages) {
          const msgTimestamp = new Date(msg.sentAt || msg.createdAt || 0).getTime();
          const msgContent = normalizeContent(msg.content);
          const msgType = String(msg.type || '');
          const msgContactId = String(msg.contactId || '');
          const msgPhone = normalizePhone(msg.phone || selectedContact?.phone || '');
          
          // Primary dedup key: waMessageId (most reliable, globally unique)
          let dedupKey = null;
          if (msg.waMessageId) {
            dedupKey = `wa_${msg.waMessageId}`;
          } else if (msg.id) {
            const msgIdStr = String(msg.id);
            // For prefixed IDs (meta_, webhook_, temp_), use content-based key
            if (msgIdStr.startsWith('meta_') || msgIdStr.startsWith('webhook_') || msgIdStr.startsWith('temp_')) {
              dedupKey = `${msgType}_${msgContent}_${msgTimestamp}_${msgContactId || msgPhone || currentPhone}`;
            } else {
              // For regular IDs, use ID + contact (same ID might exist in different tables)
              dedupKey = `id_${msgIdStr}_${msgContactId || msgPhone || currentPhone}`;
            }
          } else {
            // Fallback: content + timestamp + contact
            dedupKey = `${msgType}_${msgContent}_${msgTimestamp}_${msgContactId || msgPhone || currentPhone}`;
          }
          
          // Check if we've seen this message before
          const existingMsg = messageMap.get(dedupKey);
          
          if (existingMsg) {
            // Duplicate found - prefer message with higher priority
            const existingPriority = getMessagePriority(existingMsg);
            const newPriority = getMessagePriority(msg);
            
            if (newPriority < existingPriority) {
              console.log('🔄 Replacing duplicate (higher priority):', {
                oldId: existingMsg.id,
                newId: msg.id,
                oldSource: existingMsg.source,
                newSource: msg.source,
                content: msgContent.substring(0, 30)
              });
              messageMap.set(dedupKey, msg);
            } else {
              console.log('🔄 Duplicate filtered out (lower priority):', {
                id: msg.id,
                type: msgType,
                content: msgContent.substring(0, 30),
                source: msg.source
              });
            }
            continue;
          }
          
          // Also check for content-based duplicates (same content, same contact, close timestamp)
          let isContentDuplicate = false;
          for (const [key, existingMsg] of messageMap.entries()) {
            // Skip ID-based keys for content matching
            if (key.startsWith('wa_') || key.startsWith('id_')) continue;
            
            const existingContent = normalizeContent(existingMsg.content);
            const existingTimestamp = new Date(existingMsg.sentAt || existingMsg.createdAt || 0).getTime();
            const existingContactId = String(existingMsg.contactId || '');
            const existingPhone = normalizePhone(existingMsg.phone || selectedContact?.phone || '');
            
            // Check if same type, same content, same contact, and within 30 seconds
            if (existingMsg.type === msgType && 
                existingContent === msgContent &&
                (existingContactId === msgContactId || existingPhone === msgPhone || 
                 (existingPhone && msgPhone && existingPhone === msgPhone)) &&
                Math.abs(existingTimestamp - msgTimestamp) < 30000) {
              isContentDuplicate = true;
              const existingPriority = getMessagePriority(existingMsg);
              const newPriority = getMessagePriority(msg);
              
              if (newPriority < existingPriority) {
                // Replace with higher priority message
                messageMap.delete(key);
                messageMap.set(dedupKey, msg);
                console.log('🔄 Replacing duplicate by content (higher priority):', {
                  oldId: existingMsg.id,
                  newId: msg.id,
                  content: msgContent.substring(0, 30)
                });
              } else {
                console.log('🔄 Duplicate by content filtered out:', {
                  id: msg.id,
                  content: msgContent.substring(0, 30)
                });
              }
              break;
            }
          }
          
          if (!isContentDuplicate) {
            messageMap.set(dedupKey, msg);
          }
        }
        
        // Convert map to array
        const uniqueMessages = Array.from(messageMap.values());

        // Final strict dedupe pass across ALL sources to prevent
        // message/message+inbox_message+webhook triplicates in UI.
        const sourcePriority = (msg) => {
          if (msg.waMessageId) return 1;
          if (!msg.source || msg.source === 'message' || msg.source === 'socket') return 2;
          if (msg.source === 'inbox_message') return 3;
          if (msg.source === 'meta_message') return 4;
          if (msg.source === 'webhook_log') return 5;
          if (msg.source === 'optimistic' || msg.isOptimistic) return 6;
          return 7;
        };

        const finalMessages = [];
        for (const msg of uniqueMessages) {
          const msgTimestamp = new Date(msg.sentAt || msg.createdAt || 0).getTime();
          const msgContent = normalizeContent(msg.content);
          const msgType = String(msg.type || '');
          const msgContactId = String(msg.contactId || '');
          const msgPhone = normalizePhone(msg.phone || selectedContact?.phone || '');

          const duplicateIdx = finalMessages.findIndex((existing) => {
            // Exact WA ID match is always duplicate.
            if (existing.waMessageId && msg.waMessageId && existing.waMessageId === msg.waMessageId) {
              return true;
            }

            const exTimestamp = new Date(existing.sentAt || existing.createdAt || 0).getTime();
            const exContent = normalizeContent(existing.content);
            const exType = String(existing.type || '');
            const exContactId = String(existing.contactId || '');
            const exPhone = normalizePhone(existing.phone || selectedContact?.phone || '');

            if (exType !== msgType) return false;
            if (exContent !== msgContent) return false;

            const sameContact =
              (exContactId && msgContactId && exContactId === msgContactId) ||
              (exPhone && msgPhone && exPhone === msgPhone);
            if (!sameContact) return false;

            // Same message arriving from different sources usually lands within a few seconds.
            return Math.abs(exTimestamp - msgTimestamp) <= 5000;
          });

          if (duplicateIdx === -1) {
            finalMessages.push(msg);
          } else {
            const existing = finalMessages[duplicateIdx];
            if (sourcePriority(msg) < sourcePriority(existing)) {
              finalMessages[duplicateIdx] = msg;
            }
          }
        }

        finalMessages.sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        console.log('Final merged messages count:', finalMessages.length, 'Optimistic:', optimisticMessages.length, 'All messages:', allMessages.length);
        
        // Always update state with the new messages (even if empty)
        // This ensures loading state is cleared and UI shows "No messages" if needed
        return finalMessages;
      });
      
      // Mark messages as read (only if contact exists)
      if (contactData) {
        try {
          await markAsRead(phone);
          // Update inbox list to reflect read status (without loading state)
          fetchInboxList(false);
        } catch (error) {
          console.error('Error marking as read:', error);
        }
      }
      
      console.log('Messages fetched successfully. Total:', allMessages.length);
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Set empty messages on error to prevent UI issues
      setMessages(prev => {
        // Only clear if we have no messages, otherwise keep existing
        if (prev.length === 0) {
          return [];
        }
        return prev;
      });
    } finally {
      // Clear timeout
      clearTimeout(timeoutId);
      // Always clear loading state and reset flag
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
      console.log('fetchMessages completed, loading cleared');
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Refresh messages when contact is selected and join/leave socket rooms
  useEffect(() => {
    if (selectedContact?.phone) {
      console.log('Contact selected, fetching messages for:', selectedContact.phone);
      
      // Reset loading state when switching contacts
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
      
      // Join contact room for real-time updates (only if contact has ID)
      if (selectedContact.id) {
        joinContactRoom(selectedContact.id);
      }
      
      // Small delay to ensure state is reset before fetching
      const fetchTimeout = setTimeout(() => {
        // Fetch messages for the selected contact
        fetchMessages(selectedContact.phone, true).catch(err => {
          console.error('Error in fetchMessages:', err);
          setLoadingMessages(false);
          fetchingMessagesRef.current = false;
        });
      }, 100);
      
      // Refresh messages every 10 seconds for active chat (reduced frequency)
      const interval = setInterval(() => {
        // Only refresh if not already fetching
        if (!fetchingMessagesRef.current && selectedContact?.phone) {
          fetchMessages(selectedContact.phone, false).catch(err => {
            console.error('Error in background fetchMessages:', err);
            fetchingMessagesRef.current = false;
          });
        }
      }, 10000);
      
      return () => {
        clearTimeout(fetchTimeout);
        clearInterval(interval);
        // Leave contact room when switching contacts
        if (selectedContact?.id) {
          leaveContactRoom(selectedContact.id);
        }
        // Reset fetching flag when component unmounts or contact changes
        fetchingMessagesRef.current = false;
      };
    } else {
      // No contact selected, clear loading state
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
    }
  }, [selectedContact?.phone]); // Depend on phone number, which is always available

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
        await markNotificationAsRead(notification.id);
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
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const formatMessageTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSendMessage = async (e, overrideText) => {
    if (e?.preventDefault) e.preventDefault();
    const phone = selectedContact?.phone;
    const textToSend = overrideText !== undefined ? String(overrideText || "") : String(messageText || "");
    if (!textToSend.trim() || !selectedContact || sending) return;

    const currentFlowState = botFlowState[phone];
    const isIntervened = intervenedPhones[phone];

    // Prevent manual sending when bot flow is active (unless admin has intervened)
    if (!isIntervened && currentFlowState && currentFlowState !== 'completed') {
      console.log('🚫 Manual sending disabled - bot is handling conversation');
      alert('Bot is currently handling this conversation. Please wait for the bot to complete.');
      return;
    }

    // Stop typing indicator
    handleTypingStop();

    const text = textToSend.trim();

    setMessageText('');
    setSending(true);

    // Create unique temp ID for optimistic message
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message FIRST (before API call)
    const optimisticMessage = {
      id: tempId,
      content: text,
      type: 'outgoing',
      status: 'sent',
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'optimistic',
      isOptimistic: true,
      phone: phone,
      contactId: selectedContact.id
    };

    // Add optimistic message immediately
    setMessages(prev => {
      // Double-check: avoid duplicates by checking content + time
      const exists = prev.find(m => 
        m.content === text && 
        m.type === 'outgoing' &&
        m.isOptimistic &&
        Math.abs(new Date(m.sentAt || m.createdAt) - new Date(optimisticMessage.sentAt)) < 2000
      );
      if (exists) {
        console.log('⚠️ Duplicate optimistic message prevented');
        return prev;
      }
      return [...prev, optimisticMessage].sort((a, b) => {
        const dateA = new Date(a.sentAt || a.createdAt || 0);
        const dateB = new Date(b.sentAt || b.createdAt || 0);
        return dateA - dateB;
      });
    });

    try {
      // Use ONLY inbox API endpoint (not both sendMetaMessage and sendMessage)
      // This prevents duplicate messages from being created
      const newMessage = await sendMessage(phone, text);
      console.log('✅ Message sent via inbox API:', newMessage);
      
      // Replace optimistic message with real message (if socket hasn't already)
      if (newMessage?.id) {
        setMessages(prev => {
          // Check if socket already added it
          const alreadyExists = prev.find(m => m.id === newMessage.id);
          if (alreadyExists) {
            // Socket already handled it, remove optimistic
            return prev.filter(m => m.id !== tempId);
          }
          
          // Replace optimistic with real message
          return prev.map(m => 
            m.id === tempId 
              ? { ...newMessage, isOptimistic: false, source: 'api' }
              : m
          ).sort((a, b) => {
            const dateA = new Date(a.sentAt || a.createdAt || 0);
            const dateB = new Date(b.sentAt || b.createdAt || 0);
            return dateA - dateB;
          });
        });
      }
      
      // Refresh inbox list to update last message (without loading state)
      fetchInboxList(false);
      
      // Note: Socket event will also update/replace the message if it arrives
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !(m.id === tempId || (m.isOptimistic && m.content === text))));
      
      alert(`Failed to send message: ${error.message || 'Please try again.'}`);
      setMessageText(text); // Restore message text on error
    } finally {
      setSending(false);
    }
  };

  const handleContactSelect = (contact) => {
    console.log('Contact clicked:', contact);
    setSelectedContact(contact);
    setMessages([]);
    setCurrentPage(1);
    setHasMoreMessages(true);
    setMessageSearchQuery('');
    setSearchResults([]);
    // Note: Don't reset botFlowState here - keep it per contact so flow continues
    
    // The useEffect will handle joining contact room and fetching messages
  };

  // Fetch approved templates
  const fetchApprovedTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const result = await getTemplates({ status: 'approved', limit: 100 });
      setTemplates(result.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      alert('Failed to fetch templates: ' + error.message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const appendToMessageText = (insertValue) => {
    const v = String(insertValue || "");
    if (!v.trim()) return;
    setMessageText((prev) => {
      const base = String(prev || "");
      return base.trim() ? `${base} ${v}` : v;
    });
  };

  // Resolve template placeholders like {{1}}, {{2}} to contact-specific values.
  const resolveTemplatePlaceholders = (rawText, contact) => {
    const text = String(rawText || "");
    if (!text.includes('{{')) return text;

    const phone = String(contact?.phone || '').trim();
    const normalizedPhone = phone.replace(/^\+/, '');
    const contactName = String(contact?.name || '').trim();
    const email = String(contact?.email || '').trim();

    const defaultName = contactName && contactName !== phone ? contactName : (normalizedPhone || 'Customer');

    const valueMap = {
      1: defaultName,
      2: normalizedPhone || defaultName,
      3: email || defaultName,
      4: normalizedPhone ? normalizedPhone.slice(-4) : defaultName,
    };

    return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (full, idxRaw) => {
      const idx = Number(idxRaw);
      if (!Number.isFinite(idx)) return full;
      const mapped = valueMap[idx];
      if (mapped && String(mapped).trim()) return String(mapped);
      return defaultName;
    });
  };

  const sendInterveneQuickItem = async (insertValue) => {
    setInterveneQuickPickerOpen(false);
    setSelectedInterveneCannedId("");
    setSelectedInterveneTemplateId("");
    try {
      const resolvedText = resolveTemplatePlaceholders(insertValue, selectedContact);
      await handleSendMessage(null, resolvedText);
    } catch (e) {
      // handleSendMessage already alerts/optimistic-updates; keep UI stable
      setInterveneQuickPickerOpen(false);
    }
  };

  const fetchInterveneInsertOptions = async () => {
    try {
      setLoadingInterveneOptions(true);
      setInterveneOptionsError("");

      const phone = selectedContact?.phone;
      if (!phone) return;

      const [cannedRes, localApprovedRes, metaRes] = await Promise.all([
        axios.get("/canned-messages"),
        getTemplates({ status: "approved", limit: 200 }),
        axios.get("/templates/meta"),
      ]);

      const cannedMessages = Array.isArray(cannedRes?.data?.messages) ? cannedRes.data.messages : [];
      setInterveneCannedOptions(
        cannedMessages.map((m) => ({
          id: String(m.id),
          label: `${m.name} (${m.type})`,
          insertValue:
            m.type === "TEXT"
              ? String(m.text || "")
              : m.type === "IMAGE"
                ? `[image:${String(m.text || "").trim() || "image"}]`
                : `[file:${String(m.text || "").trim() || "file"}]`,
        }))
      );

      const localApprovedTemplates = Array.isArray(localApprovedRes?.templates)
        ? localApprovedRes.templates
        : [];

      const localOptions = localApprovedTemplates
        .filter((t) => String(t?.status || "").toLowerCase() === "approved")
        .map((t) => ({
          id: `local_${t.id}`,
          label: String(t?.name || "Template"),
          insertValue: String(t?.content || ""),
        }));

      const metaTemplates = Array.isArray(metaRes?.data?.templates) ? metaRes.data.templates : [];
      const metaOptions = metaTemplates
        .filter((t) => String(t?.metaStatus || t?.status || "").toUpperCase() === "APPROVED")
        .map((t) => {
          const body = t?.components?.find((c) => String(c?.type || "").toUpperCase() === "BODY");
          const bodyText = body?.text || t?.name || "";
          return {
            id: `meta_${t.id}`,
            label: String(t?.name || "Meta Template"),
            insertValue: String(bodyText),
          };
        });

      setInterveneTemplateOptions([...localOptions, ...metaOptions]);
      interveneOptionsLoadedRef.current = true;
    } catch (e) {
      setInterveneOptionsError(e?.response?.data?.message || e?.message || "Failed to load intervene options");
    } finally {
      setLoadingInterveneOptions(false);
    }
  };

  useEffect(() => {
    const phone = selectedContact?.phone;
    const isIntervened =
      !!phone &&
      (intervenedPhones[phone] ||
        String(selectedContact?.chatStatus || '').toLowerCase() === 'intervened');
    if (!phone || !isIntervened) return;
    if (interveneOptionsLoadedRef.current) return;
    fetchInterveneInsertOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContact, intervenedPhones]);

  useEffect(() => {
    if (!interveneQuickPickerOpen) return;
    const onDocMouseDown = (e) => {
      const el = interveneQuickPickerRef.current;
      if (!el) return;
      if (!el.contains(e.target)) {
        setInterveneQuickPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [interveneQuickPickerOpen]);

  // Handle Start Bot flow - show template modal
  const handleStartBot = async () => {
    if (!selectedContact || sending) return;
    
    // Fetch approved templates and show modal
    await fetchApprovedTemplates();
    setShowTemplateModal(true);
  };

  // Handle template selection
  const handleTemplateSelect = async (template) => {
    if (!selectedContact || sending) return;

    const phone = selectedContact.phone;
    setSending(true);
    setShowTemplateModal(false);

    try {
      // Send template via API to user's phone
      const templateName = template.name || template.templateName;
      const templateLanguage = template.language || 'en_US';
      
      // Ensure templateParams is always an array
      let templateParams = [];
      if (template.variables) {
        if (Array.isArray(template.variables)) {
          templateParams = template.variables;
        } else if (typeof template.variables === 'string') {
          try {
            templateParams = JSON.parse(template.variables);
            if (!Array.isArray(templateParams)) {
              templateParams = [];
            }
          } catch (e) {
            templateParams = [];
          }
        } else if (typeof template.variables === 'object') {
          // Convert object to array of values
          templateParams = Object.values(template.variables);
        }
      }
      
      const response = await sendTemplateMessage(phone, templateName, templateLanguage, templateParams);
      
      // Get template content for display
      const templateContent = resolveTemplatePlaceholders(
        template.content || `Template: ${templateName}`,
        selectedContact
      );
      
      // Add template message to chat immediately (optimistic update)
      const templateMessage = {
        id: response.messageId || `template_${Date.now()}`,
        content: templateContent,
        type: 'outgoing',
        status: 'sent',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        source: 'api',
        phone: phone,
        contactId: selectedContact.id,
        waMessageId: response.waMessageId || null,
        isTemplate: true,
        templateName: templateName
      };

      setMessages(prev => {
        // Check if message already exists
        const exists = prev.find(m => 
          m.id === templateMessage.id || 
          (m.waMessageId && m.waMessageId === templateMessage.waMessageId) ||
          (m.content === templateContent && m.type === 'outgoing' && m.isTemplate && Math.abs(new Date(m.sentAt || m.createdAt) - new Date(templateMessage.sentAt)) < 5000)
        );
        if (exists) {
          console.log('Template message already exists, skipping duplicate');
          return prev;
        }
        
        console.log('Adding template message to chat:', templateMessage);
        const updatedMessages = [...prev, templateMessage].sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        return updatedMessages;
      });
      
      // Set flow state to wait for user response
      setBotFlowState(prev => ({
        ...prev,
        [phone]: 'template_sent'
      }));

      // Refresh inbox list
      fetchInboxList(false);
      
      // Refresh messages after a short delay to ensure we get the saved message from backend
      // Socket will also update it when it arrives
      setTimeout(() => {
        if (selectedContact?.phone) {
          fetchMessages(selectedContact.phone, false).catch(err => {
            console.error('Error refreshing messages after template send:', err);
          });
        }
      }, 1000);
    } catch (error) {
      console.error('Error sending template:', error);
      alert('Failed to send template: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // Handle bot button click
  const handleBotButtonClick = async (buttonValue, message) => {
    if (!selectedContact || sending) return;

    const phone = selectedContact.phone;
    const currentFlowState = botFlowState[phone];

    // Handle YES button click
    if (currentFlowState === 'template_sent' && buttonValue === 'yes') {
      setSending(true);
      try {
        const response = await sendChatbotMessage('__YES_CLICKED__', 0, currentFlowState);
        
        // Add user's selection as outgoing message
        const userMessage = {
          id: `user_${Date.now()}`,
          content: 'YES',
          type: 'outgoing',
          status: 'sent',
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          source: 'user',
          phone: phone,
          contactId: selectedContact.id
        };

        // Add bot's response as incoming message
        const botResponse = {
          id: `bot_${Date.now()}`,
          content: response.message || "Great! To help you better, could you please tell me your current salary? (Please enter numbers only, e.g., 50000)",
          type: 'incoming',
          status: 'read',
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          source: 'bot',
          phone: phone,
          contactId: selectedContact.id
        };

        setMessages(prev => {
          const newMessages = [...prev, userMessage, botResponse];
          return newMessages.sort((a, b) => {
            const dateA = new Date(a.sentAt || a.createdAt || 0);
            const dateB = new Date(b.sentAt || b.createdAt || 0);
            return dateA - dateB;
          });
        });

        setBotFlowState(prev => ({
          ...prev,
          [phone]: response.flowState || 'asking_salary'
        }));

        fetchInboxList(false);
      } catch (error) {
        console.error('Error handling bot button:', error);
        alert('Failed to process: ' + error.message);
      } finally {
        setSending(false);
      }
    }
  };

  // Handle salary input in message
  const handleSalaryInput = async (salaryText) => {
    if (!selectedContact || sending) return;

    const phone = selectedContact.phone;
    const currentFlowState = botFlowState[phone];

    if (currentFlowState === 'asking_salary' || currentFlowState === 'salary_retry') {
      setSending(true);
      try {
        const response = await sendChatbotMessage(`__SALARY_INPUT__:${salaryText}`, 0, currentFlowState);
        
        if (response.isValid === false) {
          // Invalid salary - add bot error message
          const botError = {
            id: `bot_${Date.now()}`,
            content: response.message || "Please enter a valid salary amount. It should be a positive number (e.g., 50000).",
            type: 'incoming',
            status: 'read',
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            source: 'bot',
            phone: phone,
            contactId: selectedContact.id
          };

          setMessages(prev => {
            const newMessages = [...prev, botError];
            return newMessages.sort((a, b) => {
              const dateA = new Date(a.sentAt || a.createdAt || 0);
              const dateB = new Date(b.sentAt || b.createdAt || 0);
              return dateA - dateB;
            });
          });

          setBotFlowState(prev => ({
            ...prev,
            [phone]: 'salary_retry'
          }));
        } else {
          // Valid salary - continue flow
          const botSuccess = {
            id: `bot_${Date.now()}`,
            content: response.message || "Thank you! Your information has been recorded. How else can I help you?",
            type: 'incoming',
            status: 'read',
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            source: 'bot',
            phone: phone,
            contactId: selectedContact.id,
            buttons: response.suggestions?.map((sug, idx) => ({
              id: Date.now() + idx,
              text: sug,
              value: sug.toLowerCase().replace(/\s+/g, '_')
            })) || undefined
          };

          setMessages(prev => {
            const newMessages = [...prev, botSuccess];
            return newMessages.sort((a, b) => {
              const dateA = new Date(a.sentAt || a.createdAt || 0);
              const dateB = new Date(b.sentAt || b.createdAt || 0);
              return dateA - dateB;
            });
          });

          setBotFlowState(prev => ({
            ...prev,
            [phone]: response.flowState || 'completed'
          }));
        }

        fetchInboxList(false);
      } catch (error) {
        console.error('Error handling salary input:', error);
        alert('Failed to process: ' + error.message);
      } finally {
        setSending(false);
      }
    }
  };

  // Typing indicator handlers
  const handleTypingStart = useCallback(() => {
    if (!selectedContact?.id || !user?.id) return;
    
    sendTypingStart(selectedContact.id, user.id);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop(selectedContact.id, user.id);
    }, 3000);
  }, [selectedContact, user]);

  const handleTypingStop = useCallback(() => {
    if (!selectedContact?.id || !user?.id) return;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    sendTypingStop(selectedContact.id, user.id);
  }, [selectedContact, user]);

  // Handle message input with typing indicator
  const handleMessageInputChange = (e) => {
    setMessageText(e.target.value);
    handleTypingStart();
  };

  // Delete message
  const handleDeleteMessage = async (messageId) => {
    try {
      await deleteMessage(messageId);
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setShowMessageMenu(null);
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message: ' + error.message);
    }
  };

  // Forward message
  const handleForwardMessage = async (messageId) => {
    try {
      // Get all contacts for forwarding
      const contacts = inboxList.filter(c => c.id !== selectedContact?.id);
      if (contacts.length === 0) {
        alert('No other contacts to forward to');
        return;
      }
      
      // For now, forward to first contact (can be enhanced with multi-select)
      const contactIds = [contacts[0].id];
      await forwardMessage(messageId, contactIds);
      setShowForwardDialog(false);
      setShowMessageMenu(null);
      alert('Message forwarded successfully');
    } catch (error) {
      console.error('Error forwarding message:', error);
      alert('Failed to forward message: ' + error.message);
    }
  };

  // Add reaction
  const handleAddReaction = async (messageId, emoji) => {
    try {
      const result = await addReaction(messageId, emoji);
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, reactions: result.reactions } : msg
      ));
      setShowMessageMenu(null);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  // Search messages
  const handleSearchMessages = async (query) => {
    if (!query.trim() || !selectedContact?.id) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const result = await searchMessages(selectedContact.id, query);
      setSearchResults(result.messages || []);
    } catch (error) {
      console.error('Error searching messages:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Load more messages (pagination)
  const loadMoreMessages = async () => {
    if (!selectedContact?.id || loadingMessages || !hasMoreMessages) return;

    try {
      setLoadingMessages(true);
      const nextPage = currentPage + 1;
      const result = await getPaginatedMessages(selectedContact.id, nextPage, 50);
      
      if (result.messages && result.messages.length > 0) {
        setMessages(prev => [...result.messages, ...prev]);
        setCurrentPage(nextPage);
        setHasMoreMessages(result.pagination.page < result.pagination.pages);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      setHasMoreMessages(false);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Handle media upload
  const handleMediaUpload = async (file) => {
    if (!selectedContact?.id) return;

    try {
      setUploadingMedia(true);
      const uploadResult = await uploadMedia(selectedContact.id, file);
      
      // Send media message
      await sendMediaMessage(selectedContact.id, uploadResult.media, '');
      
      setShowMediaPicker(false);
      fetchInboxList(false);
      
      // Refresh messages
      setTimeout(() => {
        fetchMessages(selectedContact.phone, false);
      }, 500);
    } catch (error) {
      console.error('Error uploading media:', error);
      alert('Failed to upload media: ' + error.message);
    } finally {
      setUploadingMedia(false);
    }
  };

  // Update contact
  const handleUpdateContact = async (updates) => {
    if (!editingContact?.id) return;

    try {
      await updateContact(editingContact.id, updates);
      setShowContactEditDialog(false);
      setEditingContact(null);
      fetchInboxList(true);
      
      // Update selected contact if it's the one being edited
      if (selectedContact?.id === editingContact.id) {
        const updatedContact = { ...selectedContact, ...updates };
        setSelectedContact(updatedContact);
      }
    } catch (error) {
      console.error('Error updating contact:', error);
      alert('Failed to update contact: ' + error.message);
    }
  };

  const filteredInboxList = inboxList.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.name?.toLowerCase().includes(query) ||
      contact.phone?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query)
    );
  });

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

  const userName = user?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Intervention popup for admin when agent clicks Intervene */}
      {interventionAlert && isAdminOrManager && (
        <div className="motion-enter fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-5 py-4 md:px-6 bg-gradient-to-r from-sky-600 via-sky-600 to-blue-700 text-white rounded-2xl shadow-xl shadow-sky-900/25 ring-1 ring-white/20 flex items-center gap-3 min-w-[320px] max-w-md backdrop-blur-sm">
          <span className="font-semibold shrink-0">Intervention</span>
          <span className="text-sm text-sky-50">
            <strong className="text-white">{interventionAlert.agentName}</strong> intervened
            {interventionAlert.dateTime && (
              <> at {new Date(interventionAlert.dateTime).toLocaleString()}</>
            )}
            {interventionAlert.phone && <> (phone: {interventionAlert.phone})</>}.
          </span>
          <button
            type="button"
            onClick={() => setInterventionAlert(null)}
            className="ml-auto p-2 rounded-xl hover:bg-white/15 active:scale-95 transition-all duration-200"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Inbox</h2>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => {
                setNotificationDropdownOpen(!notificationDropdownOpen);
                if (!notificationDropdownOpen) {
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
                      type="button"
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
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition border-l-4 ${
                            !notification.is_read
                              ? 'bg-sky-50 border-sky-500'
                              : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                notification.type === 'campaign'
                                  ? 'bg-sky-100'
                                  : notification.type === 'template'
                                    ? 'bg-green-100'
                                    : notification.type === 'message'
                                      ? 'bg-purple-100'
                                      : 'bg-gray-100'
                              }`}
                            >
                              {notification.type === 'campaign' && (
                                <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-sky-600 rounded-full mt-1" />
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
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar - Navigation */}
        <aside className={`${sidebarOpen ? 'w-20' : 'w-0 md:w-20'} h-full shrink-0 flex flex-col bg-sky-950 text-white border-r border-sky-900 transition-all duration-300 overflow-hidden`}>
          <MainSidebarNav />
        </aside>

        {/* Main Inbox Area */}
        <div className="relative flex-1 flex min-w-0 overflow-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
            <div className="absolute -top-28 -right-16 w-[20rem] h-[20rem] bg-sky-400/25 motion-page-blob" />
            <div className="absolute bottom-0 -left-20 w-[18rem] h-[18rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
          </div>
          {/* Left Panel - Chat List */}
          <div className="relative z-[1] w-80 border-r border-gray-200/90 bg-white/95 backdrop-blur-sm flex flex-col shadow-sm shadow-gray-200/25 ring-1 ring-gray-100/60">
            {/* Requesting (admin/manager): unassigned conversations — assign to agent */}
            {/* {isAdminOrManager && (
              <div className="border-b border-gray-200 bg-amber-50/80">
                <div className="px-3 py-2">
                  <span className="text-sm font-semibold text-gray-800">Requesting</span>
                </div>
                <div className="max-h-48 overflow-y-auto px-3 pb-3">
                  {loadingRequesting ? (
                    <p className="text-xs text-gray-500 py-2">Loading...</p>
                  ) : requestingList.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">No requesting conversations</p>
                  ) : (
                    <ul className="space-y-2">
                      {requestingList.map((conv) => (
                        <li
                          key={conv.id}
                          className="bg-white border border-gray-200 rounded-lg p-2 text-left shadow-sm"
                        >
                          <div className="text-xs font-medium text-gray-800 truncate">
                            {conv.phone || conv.customer_name || `#${conv.id}`}
                          </div>
                          <div className="text-xs text-gray-600 truncate mt-0.5">
                            {conv.last_message || '—'}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <select
                              className="flex-1 min-w-0 text-xs border border-gray-300 rounded py-1 px-2 bg-white"
                              value=""
                              onChange={(e) => {
                                const agentId = e.target.value;
                                if (agentId) handleAssignToAgent(conv.id, Number(agentId));
                              }}
                              disabled={!!assigningId}
                            >
                              <option value="">Assign to agent...</option>
                              {agentsList.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name || a.email}
                                </option>
                              ))}
                            </select>
                            {assigningId === conv.id && (
                              <span className="text-xs text-gray-400">Assigning...</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )} */}
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-200/80 bg-gradient-to-b from-white to-sky-50/20">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto">
              {loadingInbox ? (
                <div className="p-8 text-center motion-enter">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                  <p className="mt-2 text-sm text-gray-500">Loading conversations...</p>
                </div>
              ) : filteredInboxList.length === 0 ? (
                <div className="p-8 text-center motion-enter">
                  <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-600 mb-2">No conversations found</p>
                  <p className="text-sm text-gray-500">Start a conversation by sending a message</p>
                </div>
              ) : (
                <div className="motion-stagger-children divide-y divide-gray-100/90">
                  {filteredInboxList.map((contact) => (
                    <button
                      type="button"
                      key={contact.contactId || `contact_${contact.phone}`}
                      onClick={() => handleContactSelect(contact)}
                      className={`w-full p-4 text-left transition-all duration-200 hover:bg-sky-50/60 active:scale-[0.99] ${
                        selectedContact?.phone === contact.phone
                          ? 'bg-sky-50/90 border-l-4 border-sky-600 shadow-inner shadow-sky-100/50'
                          : 'border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/25 ring-2 ring-white">
                          <span className="text-white font-semibold text-lg">
                            {contact.name?.charAt(0).toUpperCase() || contact.phone.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {contact.name || contact.phone}
                            </p>
                            {contact.lastMessageTime && (
                              <p className="text-xs text-gray-500 flex-shrink-0 ml-2">
                                {formatTime(contact.lastMessageTime)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-gray-600 truncate flex-1 min-w-0">
                              {contact.lastMessage || 'No messages'}
                            </p>
                            {contact.whatsappOptInAt && (
                              <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-100 rounded" title={`Opted in ${formatTime(contact.whatsappOptInAt)}`}>
                                Opted in
                              </span>
                            )}
                            {contact.unreadCount > 0 && (
                              <span className="ml-2 px-2 py-0.5 bg-sky-600 text-white text-xs font-semibold rounded-full flex-shrink-0 shadow-sm shadow-sky-600/30">
                                {contact.unreadCount > 9 ? '9+' : contact.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Chat Window */}
          <div className="relative z-[1] flex-1 flex flex-col min-w-0 bg-sky-50/40 backdrop-blur-[1px]">
            {selectedContact ? (
              <>
                {/* Chat Header */}
                <div className="relative bg-white/95 backdrop-blur-md border-b border-gray-200/80 px-6 py-4 flex items-center justify-between shadow-sm shadow-gray-200/30">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center shadow-md shadow-sky-500/25 ring-2 ring-white">
                        <span className="text-white font-semibold">
                          {selectedContact.name?.charAt(0).toUpperCase() || selectedContact.phone.charAt(0)}
                        </span>
                      </div>
                      {/* Online status indicator */}
                      {onlineContacts[selectedContact.id]?.isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {selectedContact.name || selectedContact.phone}
                        </p>
                        {onlineContacts[selectedContact.id]?.isOnline ? (
                          <span className="text-xs text-green-600">Online</span>
                        ) : onlineContacts[selectedContact.id]?.lastSeen ? (
                          <span className="text-xs text-gray-500">
                            Last seen {formatTime(onlineContacts[selectedContact.id].lastSeen)}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500">{selectedContact.phone}</p>
                      {selectedContact.whatsappOptInAt && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full" title={`Consent via START/YES on ${formatTime(selectedContact.whatsappOptInAt)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          Opted in
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Message search */}
                    <button
                      type="button"
                      onClick={() => setIsSearching(!isSearching)}
                      className="p-2 rounded-xl hover:bg-sky-50 text-gray-600 hover:text-sky-700 transition-all duration-200 active:scale-95"
                      title="Search messages"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    {/* Contact menu */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowContactMenu(!showContactMenu);
                        setEditingContact(selectedContact);
                      }}
                      className="p-2 rounded-xl hover:bg-sky-50 text-gray-600 hover:text-sky-700 transition-all duration-200 active:scale-95"
                      title="Contact options"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Contact menu dropdown */}
                  {showContactMenu && (
                    <div className="motion-pop absolute right-4 top-[4.5rem] bg-white rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-100 z-50 w-48 ring-1 ring-black/5 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setShowContactEditDialog(true);
                          setShowContactMenu(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-sky-50 flex items-center gap-2 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Contact
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const history = await getContactHistory(selectedContact.id);
                            console.log('Contact history:', history);
                            alert(`Total messages: ${history.stats.totalMessages}`);
                          } catch (error) {
                            console.error('Error fetching history:', error);
                          }
                          setShowContactMenu(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-sky-50 flex items-center gap-2 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        View History
                      </button>
                    </div>
                  )}
                </div>

                {/* Message search bar */}
                {isSearching && (
                  <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200/80 px-6 py-3 shadow-sm">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search in conversation..."
                        value={messageSearchQuery}
                        onChange={(e) => {
                          setMessageSearchQuery(e.target.value);
                          handleSearchMessages(e.target.value);
                        }}
                        className="w-full pl-10 pr-10 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 text-sm transition-all"
                      />
                      <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearching(false);
                          setMessageSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-sky-600 transition-colors rounded-lg p-0.5"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Typing indicator */}
                {typingContacts[selectedContact.id] && (
                  <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200/80 px-6 py-2 motion-enter">
                    <p className="text-sm text-sky-700/80 italic">
                      {selectedContact.name || selectedContact.phone} is typing...
                    </p>
                  </div>
                )}

                {/* Messages Area */}
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-4 md:p-6 space-y-0 bg-gradient-to-b from-transparent via-sky-50/20 to-sky-100/30"
                >
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full min-h-[200px]">
                      <div className="text-center motion-enter">
                        <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-gray-600">No messages yet</p>
                        <p className="text-sm text-gray-500 mt-1">Start the conversation!</p>
                      </div>
                    </div>
                  ) : (
                    <InfiniteScroll
                      dataLength={messages.length}
                      next={loadMoreMessages}
                      hasMore={hasMoreMessages}
                      loader={null}
                      inverse={false}
                      scrollableTarget={chatContainerRef.current}
                    >
                      {messages.map((message, index) => {
                        // Ensure key is always unique
                        const messageKey = message.id || `msg_${message.source || 'unknown'}_${index}_${message.sentAt || message.createdAt || Date.now()}`;
                        const isSelected = selectedMessage === message.id;
                        return (
                          <div
                            key={messageKey}
                            className={`flex ${message.type === 'outgoing' ? 'justify-end' : 'justify-start'} group relative mb-3`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelectedMessage(message.id);
                              setShowMessageMenu(message.id);
                            }}
                          >
                            <div
                              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl relative shadow-sm transition-shadow duration-200 ${
                                message.type === 'outgoing'
                                  ? 'bg-gradient-to-br from-sky-600 to-sky-700 text-white shadow-sky-600/25'
                                  : 'bg-white/95 text-gray-900 border border-gray-200/90 backdrop-blur-sm shadow-gray-200/40'
                              }`}
                            >
                              {/* Reply indicator */}
                              {message.replyToId && (
                                <div className={`text-xs mb-2 pb-2 border-b ${
                                  message.type === 'outgoing' ? 'border-sky-400/80 text-sky-100' : 'border-gray-300 text-gray-500'
                                }`}>
                                  Replying to message
                                </div>
                              )}

                              {/* Forwarded indicator */}
                              {message.forwardedFrom && (
                                <div className={`text-xs mb-2 pb-2 border-b ${
                                  message.type === 'outgoing' ? 'border-sky-400/80 text-sky-100' : 'border-gray-300 text-gray-500'
                                }`}>
                                  Forwarded
                                </div>
                              )}

                              {/* Media display */}
                              {message.mediaType && message.mediaType !== 'text' && message.mediaUrl && (
                                <div className="mb-2">
                                  {message.mediaType === 'image' && (
                                    <img 
                                      src={`http://localhost:5000${message.mediaUrl}`} 
                                      alt="Message media" 
                                      className="max-w-full rounded-lg cursor-pointer"
                                      onClick={() => window.open(`http://localhost:5000${message.mediaUrl}`, '_blank')}
                                    />
                                  )}
                                  {message.mediaType === 'video' && (
                                    <video 
                                      src={`http://localhost:5000${message.mediaUrl}`} 
                                      controls 
                                      className="max-w-full rounded-lg"
                                    />
                                  )}
                                  {message.mediaType === 'audio' && (
                                    <audio 
                                      src={`http://localhost:5000${message.mediaUrl}`} 
                                      controls 
                                      className="w-full"
                                    />
                                  )}
                                  {message.mediaType === 'document' && (
                                    <a 
                                      href={`http://localhost:5000${message.mediaUrl}`} 
                                      download
                                      className="flex items-center gap-2 p-2 bg-gray-100 rounded"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-sm">{message.mediaFilename || 'Document'}</span>
                                    </a>
                                  )}
                                </div>
                              )}

                              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                              
                              {/* Bot Buttons */}
                              {message.buttons && message.buttons.length > 0 && message.type === 'incoming' && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {message.buttons.map((button) => (
                                    <button
                                      key={button.id}
                                      onClick={() => handleBotButtonClick(button.value, message)}
                                      disabled={sending}
                                      className="px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold rounded-xl border border-sky-200/80 shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
                                    >
                                      {button.text}
                                    </button>
                                  ))}
                                </div>
                              )}
                              
                              {/* Reactions */}
                              {message.reactions && message.reactions.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {message.reactions.map((reaction, idx) => (
                                    <span 
                                      key={idx}
                                      className="px-2 py-1 bg-gray-200 rounded-full text-xs"
                                      title={`${reaction.emoji} by user ${reaction.userId}`}
                                    >
                                      {reaction.emoji}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className={`flex items-center justify-between gap-2 mt-1 ${
                                message.type === 'outgoing' ? 'text-sky-100' : 'text-gray-500'
                              }`}>
                                <p className="text-xs">{formatMessageTime(message.sentAt || message.createdAt)}</p>
                                <div className="flex items-center gap-1">
                                  {message.type === 'outgoing' && (
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      {message.status === 'read' ? (
                                        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                                      ) : message.status === 'delivered' ? (
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      ) : (
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      )}
                                    </svg>
                                  )}
                                  {/* Message menu button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedMessage(message.id);
                                      setShowMessageMenu(showMessageMenu === message.id ? null : message.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-black/10 rounded-xl"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Message menu */}
                              {showMessageMenu === message.id && (
                                <div className="motion-pop absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-100 z-50 w-48 ring-1 ring-black/5 overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const emoji = prompt('Enter emoji reaction:');
                                      if (emoji) handleAddReaction(message.id, emoji);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-sky-50 flex items-center gap-2 transition-colors"
                                  >
                                    <span>😀</span>
                                    Add Reaction
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowForwardDialog(true);
                                      setSelectedMessage(message.id);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-sky-50 flex items-center gap-2 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                    Forward
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm('Delete this message?')) {
                                        handleDeleteMessage(message.id);
                                      }
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </InfiniteScroll>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* In-chat Intervene bar when there is a customer message and not yet intervened */}
                {selectedContact?.phone &&
                  !(
                    intervenedPhones[selectedContact.phone] ||
                    String(selectedContact?.chatStatus || '').toLowerCase() === 'intervened'
                  ) &&
                  messages.some((m) => m.type === 'incoming') && (
                  <div className="bg-gradient-to-r from-amber-50/95 via-amber-50/80 to-orange-50/60 border-t border-amber-200/80 px-6 py-3 flex items-center justify-center gap-3 flex-wrap shadow-inner motion-enter">
                    <span className="text-sm text-amber-900/90 font-medium">New customer message — take over the conversation</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const phone = selectedContact.phone;
                        if (!phone) return;
                        try {
                          let selectedAgentId = null;
                          try {
                            const raw = localStorage.getItem('selectedAgent');
                            const parsed = raw ? JSON.parse(raw) : null;
                            selectedAgentId = parsed?.id ?? parsed?._id ?? null;
                          } catch (e) {}
                          const result = await interveneByPhone(phone, selectedAgentId);
                          if (result?.success) {
                            setIntervenedPhones((prev) => ({ ...prev, [phone]: true }));
                            fetchInboxList(false);
                          } else {
                            alert(result?.message || 'Failed to intervene');
                          }
                        } catch (e) {
                          alert(e?.message || 'Failed to intervene');
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 shadow-md shadow-sky-600/25 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
                    >
                      Intervene
                    </button>
                  </div>
                )}

                {/* Message Input: when intervened show Send; otherwise Intervene (admin) when chat has customer message or is selected */}
                <div className="bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-6 py-4 flex justify-center items-center flex-wrap gap-2 shadow-[0_-4px_24px_-8px_rgba(14,165,233,0.12)]">
                  {selectedContact?.phone && (
                    (intervenedPhones[selectedContact.phone] ||
                      String(selectedContact?.chatStatus || '').toLowerCase() === 'intervened') ? (
                      <form onSubmit={handleSendMessage} className="flex flex-col gap-2 flex-1 min-w-[220px] max-w-2xl">
                        <div className="relative w-full">
                          <div className="flex items-center justify-end mb-2">
                            <button
                              type="button"
                              onClick={() => setInterveneQuickPickerOpen((v) => !v)}
                              disabled={loadingInterveneOptions || sending}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-gray-200/90 rounded-xl text-xs font-semibold text-gray-800 hover:bg-sky-50/80 hover:border-sky-200/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                              title="Insert canned message or approved template"
                            >
                              <span className="text-base leading-none">📋</span>
                              Insert
                            </button>
                          </div>

                          {interveneQuickPickerOpen && (
                            <div
                              ref={interveneQuickPickerRef}
                              className="motion-pop absolute right-0 bottom-full mb-2 w-[420px] max-w-[92vw] bg-white rounded-2xl border border-sky-100/90 shadow-2xl shadow-sky-900/15 z-50 overflow-hidden ring-1 ring-black/5"
                            >
                              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-sky-50/40 border-b border-gray-100 flex items-center justify-between gap-2">
                                <div className="text-sm font-bold text-gray-900 tracking-tight">Quick Insert</div>
                                <button
                                  type="button"
                                  onClick={() => setInterveneQuickPickerOpen(false)}
                                  className="w-8 h-8 rounded-xl hover:bg-white text-gray-500 hover:text-gray-900 transition border border-transparent hover:border-gray-200"
                                  aria-label="Close"
                                >
                                  ×
                                </button>
                              </div>

                              <div className="max-h-[380px] overflow-y-auto">
                                {loadingInterveneOptions ? (
                                  <div className="px-4 py-6 flex items-center gap-2 text-sm text-gray-500">
                                    <div className="h-5 w-5 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                                    Loading options...
                                  </div>
                                ) : (
                                  <>
                                    {interveneOptionsError && (
                                      <div className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50/50">
                                        {interveneOptionsError}
                                      </div>
                                    )}

                                    <div className="px-4 py-3">
                                      <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Canned Messages</div>
                                      {interveneCannedOptions.length === 0 ? (
                                        <div className="text-xs text-gray-500">No canned messages.</div>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {interveneCannedOptions.map((opt) => {
                                            const preview = String(opt.insertValue || "").trim();
                                            const previewText =
                                              preview.length > 48 ? `${preview.slice(0, 48)}...` : preview;
                                            return (
                                              <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => sendInterveneQuickItem(opt.insertValue)}
                                                disabled={sending}
                                                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/80 border-2 border-gray-100 hover:border-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                              >
                                                <div className="text-sm font-semibold text-gray-900 truncate">{opt.label}</div>
                                                <div className="text-xs text-gray-500 truncate mt-0.5">{previewText || "—"}</div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    <div className="border-t border-gray-100" />

                                    <div className="px-4 py-3">
                                      <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Approved Templates</div>
                                      {interveneTemplateOptions.length === 0 ? (
                                        <div className="text-xs text-gray-500">No approved templates.</div>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {interveneTemplateOptions.map((opt) => {
                                            const preview = String(opt.insertValue || "").trim();
                                            const previewText =
                                              preview.length > 48 ? `${preview.slice(0, 48)}...` : preview;
                                            return (
                                              <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => sendInterveneQuickItem(opt.insertValue)}
                                                disabled={sending}
                                                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/80 border-2 border-gray-100 hover:border-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                              >
                                                <div className="text-sm font-semibold text-gray-900 truncate">{opt.label}</div>
                                                <div className="text-xs text-gray-500 truncate mt-0.5">{previewText || "—"}</div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all text-sm"
                            disabled={sending}
                          />
                          <button
                            type="submit"
                            disabled={!messageText.trim() || sending}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 text-white font-semibold text-sm hover:from-sky-700 hover:to-sky-800 shadow-md shadow-sky-600/25 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                          >
                            {sending ? 'Sending...' : 'Send'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const phone = selectedContact.phone;
                          if (!phone) return;
                          try {
                            let selectedAgentId = null;
                            try {
                              const raw = localStorage.getItem('selectedAgent');
                              const parsed = raw ? JSON.parse(raw) : null;
                              selectedAgentId = parsed?.id ?? parsed?._id ?? null;
                            } catch (e) {}
                            const result = await interveneByPhone(phone, selectedAgentId);
                            if (result?.success) {
                              setIntervenedPhones((prev) => ({ ...prev, [phone]: true }));
                              fetchInboxList(false);
                            } else {
                              alert(result?.message || 'Failed to intervene');
                            }
                          } catch (e) {
                            alert(e?.message || 'Failed to intervene');
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 shadow-md shadow-sky-600/25 transition-all duration-200 active:scale-[0.98]"
                      >
                        Intervene
                      </button>
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-sky-50/40 via-transparent to-sky-100/20">
                <div className="text-center motion-enter px-6">
                  <svg className="w-24 h-24 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-xl font-bold text-gray-800 mb-2 tracking-tight">Select a conversation</p>
                  <p className="text-sm text-gray-600">Choose a contact from the list to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Edit Dialog */}
      {showContactEditDialog && editingContact && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 w-full max-w-md overflow-hidden ring-1 ring-black/5">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Edit Contact</h3>
            </div>
            <form
              className="p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/20"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleUpdateContact({
                  name: formData.get('name'),
                  email: formData.get('email'),
                  notes: formData.get('notes'),
                  tags: formData.get('tags')?.split(',').map(t => t.trim()).filter(t => t) || []
                });
              }}
            >
              <div className="space-y-4 rounded-2xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/70">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingContact.name}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingContact.email || ''}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Notes</label>
                  <textarea
                    name="notes"
                    defaultValue={editingContact.notes || ''}
                    rows={3}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all text-sm resize-y min-h-[5rem]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Tags (comma-separated)</label>
                  <input
                    type="text"
                    name="tags"
                    defaultValue={Array.isArray(editingContact.tags) ? editingContact.tags.join(', ') : ''}
                    placeholder="tag1, tag2, tag3"
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowContactEditDialog(false);
                    setEditingContact(null);
                  }}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 shadow-md shadow-sky-600/25 transition-all duration-200 active:scale-[0.98]"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Message Dialog */}
      {showForwardDialog && selectedMessage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 w-full max-w-md overflow-hidden ring-1 ring-black/5">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/40 to-sky-50/25">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Forward Message</h3>
            </div>
            <div className="p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/15">
              <div className="max-h-64 overflow-y-auto mb-4 rounded-xl border border-gray-100/90 bg-gray-50/40 divide-y divide-gray-100/80">
                {inboxList.filter(c => c.id !== selectedContact?.id).map(contact => (
                  <label key={contact.id} className="flex items-center gap-3 p-3 hover:bg-sky-50/50 rounded-xl cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      value={contact.id}
                      className="rounded border-gray-300 text-sky-600 focus:ring-sky-400"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center shrink-0 shadow-sm shadow-sky-500/20">
                        <span className="text-white text-xs font-semibold">
                          {contact.name?.charAt(0).toUpperCase() || contact.phone.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{contact.name || contact.phone}</p>
                        <p className="text-xs text-gray-500 truncate">{contact.phone}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowForwardDialog(false);
                    setSelectedMessage(null);
                  }}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
                    const contactIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
                    if (contactIds.length > 0) {
                      await handleForwardMessage(selectedMessage);
                    } else {
                      alert('Please select at least one contact');
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 shadow-md shadow-sky-600/25 transition-all duration-200 active:scale-[0.98]"
                >
                  Forward
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden ring-1 ring-black/5">
            {/* Modal Header */}
            <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Select Template</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-400 hover:text-gray-700 rounded-xl p-2 transition-all duration-200 hover:bg-white/90 active:scale-95 ring-1 ring-transparent hover:ring-gray-200/80"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/20 min-h-0">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12 motion-enter">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600" />
                  <p className="ml-3 text-gray-600">Loading templates...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 motion-enter">
                  <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-700 font-semibold">No approved templates found</p>
                  <p className="text-sm text-gray-500 mt-2">Please create and approve templates first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 motion-stagger-children">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleTemplateSelect(template)}
                      className="text-left p-4 border-2 border-gray-100 rounded-2xl hover:border-sky-300 hover:bg-sky-50/50 transition-all duration-200 shadow-sm hover:shadow-md motion-hover-lift bg-white/90"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900">{template.name}</h3>
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                              Approved
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2 line-clamp-3 whitespace-pre-wrap">
                            {template.content || 'No content'}
                          </p>
                          {template.category && (
                            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                              {template.category}
                            </span>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 md:px-6 py-4 border-t border-gray-100 flex justify-end bg-white/95 backdrop-blur-sm shrink-0">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-5 py-2.5 text-gray-700 font-medium border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inbox;

