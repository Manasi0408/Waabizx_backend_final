import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InfiniteScroll from 'react-infinite-scroll-component';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { getNotifications, markAsRead as markNotificationAsRead, markAllAsRead } from '../services/notificationService';
import { getInboxList, getContactMessages, sendMessage, markAsRead } from '../services/inboxService';
import { getInboundMessages, sendMetaMessage, getAllMetaMessages, getWebhookLogs } from '../services/metaMessageService';
import { initializeSocket, disconnectSocket, joinContactRoom, leaveContactRoom, sendTypingStart, sendTypingStop, onSocketEvent, offSocketEvent } from '../services/socketService';
import { deleteMessage, forwardMessage, addReaction, searchMessages, getPaginatedMessages } from '../services/messageService';
import { uploadMedia, sendMediaMessage } from '../services/mediaService';
import { updateContact, getContactHistory, updateTypingStatus, updateOnlineStatus } from '../services/contactManagementService';

function Inbox() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
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
  const dropdownRef = useRef(null);
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
      const handleNewMessage = (message) => {
        console.log('📨 Socket: new-message received', message);
        
        // Check if this message is for the currently selected contact
        const isForSelectedContact = selectedContact && (
          message.contactId === selectedContact.id || 
          message.phone === selectedContact.phone ||
          (selectedContact.phone && message.phone && selectedContact.phone.replace(/\D/g, '') === message.phone.replace(/\D/g, ''))
        );

        if (isForSelectedContact) {
          setMessages(prev => {
            // Check if message already exists (by ID or content+timestamp)
            const exists = prev.find(m => 
              m.id === message.id || 
              (m.content === message.content && 
               Math.abs(new Date(m.sentAt || m.createdAt) - new Date(message.sentAt || message.createdAt)) < 2000)
            );
            
            if (exists) {
              // Update existing message (replace optimistic with real one)
              console.log('🔄 Updating existing message from socket');
              return prev.map(m => 
                (m.id === message.id || 
                 (m.content === message.content && 
                  Math.abs(new Date(m.sentAt || m.createdAt) - new Date(message.sentAt || message.createdAt)) < 2000))
                  ? { ...message, isOptimistic: false, source: 'socket' }
                  : m
              ).sort((a, b) => {
                const dateA = new Date(a.sentAt || a.createdAt || 0);
                const dateB = new Date(b.sentAt || b.createdAt || 0);
                return dateA - dateB;
              });
            }
            
            // Add new message
            console.log('➕ Adding new message from socket');
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

      return () => {
        offSocketEvent('new-message', handleNewMessage);
        offSocketEvent('message-status-update', handleStatusUpdate);
        offSocketEvent('typing', handleTyping);
        offSocketEvent('online-status', handleOnlineStatus);
        offSocketEvent('inbox-update', handleInboxUpdate);
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
        if (selectedContact) {
          const hasNewMessage = inboundMessages.some(msg => msg.phone === selectedContact.phone);
          if (hasNewMessage) {
            fetchMessages(selectedContact.phone);
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
          if (!msg.id) {
            // Generate a unique ID if missing
            const timestamp = new Date(msg.sentAt || msg.createdAt || Date.now()).getTime();
            const source = msg.source || 'message';
            return { ...msg, id: `${source}_${timestamp}_${index}` };
          }
          return msg;
        });
        
        // Combine fetched messages with optimistic messages
        const combinedMessages = [...processedMessages, ...optimisticMessages];
        
        // Remove duplicates and sort by timestamp
        const uniqueMessages = [];
        const seenIds = new Set();
        
        // Sort all messages by timestamp first
        combinedMessages.sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        // Remove duplicates (prefer server messages over optimistic ones)
        for (const msg of combinedMessages) {
          // Use ID as primary key, fallback to content+timestamp if ID is still missing
          const dedupKey = msg.id || `${msg.content}_${new Date(msg.sentAt || msg.createdAt || 0).getTime()}`;
          
          // If we've seen this ID, check if current message is from server (prefer server messages)
          if (seenIds.has(dedupKey)) {
            const existingIndex = uniqueMessages.findIndex(m => 
              m.id === msg.id || 
              (!m.id && !msg.id && m.content === msg.content && 
               Math.abs(new Date(m.sentAt || m.createdAt) - new Date(msg.sentAt || msg.createdAt)) < 2000)
            );
            if (existingIndex >= 0) {
              // Replace optimistic with server message if found
              if (uniqueMessages[existingIndex].isOptimistic && !msg.isOptimistic) {
                uniqueMessages[existingIndex] = msg;
              }
            }
            continue;
          }
          
          seenIds.add(dedupKey);
          uniqueMessages.push(msg);
        }
        
        console.log('Final merged messages count:', uniqueMessages.length, 'Optimistic:', optimisticMessages.length, 'All messages:', allMessages.length);
        
        // Always update state with the new messages (even if empty)
        // This ensures loading state is cleared and UI shows "No messages" if needed
        return uniqueMessages;
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedContact || sending) return;

    // Stop typing indicator
    handleTypingStop();

    const text = messageText.trim();
    const phone = selectedContact.phone;
    setMessageText('');
    setSending(true);

    try {
      // Send via message API (WhatsApp API) - this will emit socket events
      let newMessage = null;
      try {
        const response = await sendMetaMessage(phone, text);
        newMessage = response;
        console.log('✅ Message sent via API:', newMessage);
      } catch (metaError) {
        console.error('Error sending via message API:', metaError);
        // Still try inbox API as fallback
        try {
          newMessage = await sendMessage(phone, text);
        } catch (inboxError) {
          console.error('Error sending via inbox API:', inboxError);
        }
      }
      
      // Create optimistic message (will be replaced by socket event if successful)
      const optimisticMessage = {
        id: newMessage?.id || `temp_${Date.now()}`,
        content: text,
        type: 'outgoing',
        status: newMessage?.status || 'sent',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        source: 'optimistic',
        isOptimistic: true,
        phone: phone
      };

      // Add message to local state immediately (optimistic update)
      setMessages(prev => {
        // Check if message already exists (avoid duplicates)
        const exists = prev.find(m => 
          m.id === optimisticMessage.id || 
          (m.content === text && 
           m.isOptimistic && 
           Math.abs(new Date(m.sentAt || m.createdAt) - new Date(optimisticMessage.sentAt)) < 2000)
        );
        if (exists) return prev;
        return [...prev, optimisticMessage].sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
      });

      // Refresh inbox list to update last message (without loading state)
      fetchInboxList(false);
      
      // Note: Socket event will update the optimistic message with real data
      // No need to manually refresh - socket will handle it
    } catch (error) {
      console.error('Error sending message:', error);
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
    
    // The useEffect will handle joining contact room and fetching messages
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const userName = user?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition lg:hidden"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 hidden sm:block">AiSensy</h1>
          </Link>
          
          <span className="text-gray-400 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-gray-600 hidden md:block">Inbox</h2>
        </div>
        
        <div className="flex items-center gap-3 md:gap-4">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => {
                setNotificationDropdownOpen(!notificationDropdownOpen);
                if (!notificationDropdownOpen) {
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

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold hover:from-blue-600 hover:to-blue-700 transition shadow-md"
            >
              {userInitial}
            </button>
            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-200">
                  <p className="text-sm font-semibold text-gray-800">{userName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <Link
                  to="/settings"
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Settings</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition"
                >
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar - Navigation */}
        <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 transition-all duration-300 overflow-hidden`}>
          <nav className="p-4 space-y-1 h-full overflow-y-auto">
            <Link
              to="/dashboard"
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Dashboard</span>
            </Link>
            <Link
              to="/campaigns"
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Campaigns</span>
            </Link>
            <Link
              to="/templates"
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Templates</span>
            </Link>
            <Link
              to="/contacts"
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Contacts</span>
            </Link>
            <Link
              to="/inbox"
              className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-600 font-medium rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Inbox</span>
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Analytics</span>
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className={sidebarOpen ? 'block' : 'hidden'}>Settings</span>
            </Link>
          </nav>
        </aside>

        {/* Main Inbox Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Chat List */}
          <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto">
              {loadingInbox ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading conversations...</p>
                </div>
              ) : filteredInboxList.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-600 mb-2">No conversations found</p>
                  <p className="text-sm text-gray-500">Start a conversation by sending a message</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredInboxList.map((contact) => (
                    <button
                      key={contact.contactId || `contact_${contact.phone}`}
                      onClick={() => handleContactSelect(contact)}
                      className={`w-full p-4 text-left hover:bg-gray-50 transition ${
                        selectedContact?.phone === contact.phone ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
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
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-600 truncate flex-1">
                              {contact.lastMessage || 'No messages'}
                            </p>
                            {contact.unreadCount > 0 && (
                              <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full flex-shrink-0">
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
          <div className="flex-1 flex flex-col bg-gray-50">
            {selectedContact ? (
              <>
                {/* Chat Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Message search */}
                    <button
                      onClick={() => setIsSearching(!isSearching)}
                      className="p-2 rounded-lg hover:bg-gray-100 transition"
                      title="Search messages"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    {/* Contact menu */}
                    <button
                      onClick={() => {
                        setShowContactMenu(!showContactMenu);
                        setEditingContact(selectedContact);
                      }}
                      className="p-2 rounded-lg hover:bg-gray-100 transition"
                      title="Contact options"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Contact menu dropdown */}
                  {showContactMenu && (
                    <div className="absolute right-4 top-16 bg-white rounded-lg shadow-xl border border-gray-200 z-50 w-48">
                      <button
                        onClick={() => {
                          setShowContactEditDialog(true);
                          setShowContactMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Contact
                      </button>
                      <button
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
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
                  <div className="bg-white border-b border-gray-200 px-6 py-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search in conversation..."
                        value={messageSearchQuery}
                        onChange={(e) => {
                          setMessageSearchQuery(e.target.value);
                          handleSearchMessages(e.target.value);
                        }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                      <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <button
                        onClick={() => {
                          setIsSearching(false);
                          setMessageSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
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
                  <div className="bg-white border-b border-gray-200 px-6 py-2">
                    <p className="text-sm text-gray-500 italic">
                      {selectedContact.name || selectedContact.phone} is typing...
                    </p>
                  </div>
                )}

                {/* Messages Area */}
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-6 space-y-4"
                >
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className={`flex ${message.type === 'outgoing' ? 'justify-end' : 'justify-start'} group relative`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelectedMessage(message.id);
                              setShowMessageMenu(message.id);
                            }}
                          >
                            <div
                              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative ${
                                message.type === 'outgoing'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-900 border border-gray-200'
                              }`}
                            >
                              {/* Reply indicator */}
                              {message.replyToId && (
                                <div className={`text-xs mb-2 pb-2 border-b ${
                                  message.type === 'outgoing' ? 'border-blue-400 text-blue-100' : 'border-gray-300 text-gray-500'
                                }`}>
                                  Replying to message
                                </div>
                              )}

                              {/* Forwarded indicator */}
                              {message.forwardedFrom && (
                                <div className={`text-xs mb-2 pb-2 border-b ${
                                  message.type === 'outgoing' ? 'border-blue-400 text-blue-100' : 'border-gray-300 text-gray-500'
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
                                message.type === 'outgoing' ? 'text-blue-100' : 'text-gray-500'
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
                                    onClick={() => {
                                      setSelectedMessage(message.id);
                                      setShowMessageMenu(showMessageMenu === message.id ? null : message.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-black/10 rounded"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Message menu */}
                              {showMessageMenu === message.id && (
                                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 z-50 w-48">
                                  <button
                                    onClick={() => {
                                      const emoji = prompt('Enter emoji reaction:');
                                      if (emoji) handleAddReaction(message.id, emoji);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <span>😀</span>
                                    Add Reaction
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowForwardDialog(true);
                                      setSelectedMessage(message.id);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                    Forward
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm('Delete this message?')) {
                                        handleDeleteMessage(message.id);
                                      }
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
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

                {/* Message Input */}
                <div className="bg-white border-t border-gray-200 px-6 py-4">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                    {/* Media picker button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMediaPicker(!showMediaPicker);
                        fileInputRef.current?.click();
                      }}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition"
                      title="Attach media"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          handleMediaUpload(file);
                        }
                        e.target.value = ''; // Reset input
                      }}
                    />
                    
                    <input
                      type="text"
                      value={messageText}
                      onChange={handleMessageInputChange}
                      onBlur={handleTypingStop}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!messageText.trim() || sending}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {sending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>Send</span>
                        </>
                      )}
                    </button>
                  </form>
                  
                  {/* Upload progress */}
                  {uploadingMedia && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span>Uploading media...</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <svg className="w-24 h-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-xl font-semibold text-gray-600 mb-2">Select a conversation</p>
                  <p className="text-sm text-gray-500">Choose a contact from the list to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Edit Dialog */}
      {showContactEditDialog && editingContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Contact</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleUpdateContact({
                name: formData.get('name'),
                email: formData.get('email'),
                notes: formData.get('notes'),
                tags: formData.get('tags')?.split(',').map(t => t.trim()).filter(t => t) || []
              });
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingContact.name}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingContact.email || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    name="notes"
                    defaultValue={editingContact.notes || ''}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    name="tags"
                    defaultValue={Array.isArray(editingContact.tags) ? editingContact.tags.join(', ') : ''}
                    placeholder="tag1, tag2, tag3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowContactEditDialog(false);
                    setEditingContact(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Forward Message</h3>
            <div className="max-h-64 overflow-y-auto mb-4">
              {inboxList.filter(c => c.id !== selectedContact?.id).map(contact => (
                <label key={contact.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    value={contact.id}
                    className="rounded"
                  />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs font-semibold">
                        {contact.name?.charAt(0).toUpperCase() || contact.phone.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{contact.name || contact.phone}</p>
                      <p className="text-xs text-gray-500">{contact.phone}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowForwardDialog(false);
                  setSelectedMessage(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
                  const contactIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
                  if (contactIds.length > 0) {
                    await handleForwardMessage(selectedMessage);
                  } else {
                    alert('Please select at least one contact');
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Forward
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inbox;

