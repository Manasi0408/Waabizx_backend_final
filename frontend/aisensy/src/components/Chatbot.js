import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';
import { sendChatbotMessage, lockChatbot } from '../services/chatbotService';

function Chatbot() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [interactionCount, setInteractionCount] = useState(0);
  const [flowState, setFlowState] = useState(null); // null, 'template_sent', 'waiting_yes', 'asking_salary', 'salary_retry', 'completed'
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! 👋 I'm here to help you with Waabizx. How can I assist you today?",
      sender: 'bot',
      timestamp: new Date(),
      menuButtons: [
        { id: 1, text: '📊 View Dashboard', value: 'dashboard' },
        { id: 2, text: '📧 Create Campaign', value: 'campaign' },
        { id: 3, text: '💬 Send Message', value: 'message' },
        { id: 4, text: '👥 Manage Contacts', value: 'contacts' },
        { id: 5, text: '📈 View Analytics', value: 'analytics' },
        { id: 6, text: '🔗 Talk to Human', value: 'human' }
      ]
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current && !isLocked) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, isLocked]);

  // Reset chatbot when closed
  useEffect(() => {
    if (!isOpen) {
      // Reset after a delay to allow navigation
      setTimeout(() => {
        setIsLocked(false);
        setInteractionCount(0);
        setFlowState(null);
        setMessages([
          {
            id: 1,
            text: "Hello! 👋 I'm here to help you with Waabizx. How can I assist you today?",
            sender: 'bot',
            timestamp: new Date(),
            menuButtons: [
              { id: 1, text: '📊 View Dashboard', value: 'dashboard' },
              { id: 2, text: '📧 Create Campaign', value: 'campaign' },
              { id: 3, text: '💬 Send Message', value: 'message' },
              { id: 4, text: '👥 Manage Contacts', value: 'contacts' },
              { id: 5, text: '📈 View Analytics', value: 'analytics' },
              { id: 6, text: '🔗 Talk to Human', value: 'human' }
            ]
          }
        ]);
      }, 500);
    }
  }, [isOpen]);

  const handleStartBot = async () => {
    if (isLocked || isTyping) return;

    setIsTyping(true);
    try {
      // Send start bot request to backend
      const response = await sendChatbotMessage('__START_BOT__', interactionCount, null);
      
      const botMessage = {
        id: Date.now() + 1,
        text: response.message || response.text || "Welcome! Let's get started.",
        sender: 'bot',
        timestamp: new Date(),
        menuButtons: response.buttons?.map((btn, idx) => ({
          id: btn.id || Date.now() + idx,
          text: btn.text,
          value: btn.value || btn.text.toLowerCase().replace(/\s+/g, '_')
        })) || response.suggestions?.map((sug, idx) => ({
          id: Date.now() + idx,
          text: sug,
          value: sug.toLowerCase().replace(/\s+/g, '_')
        })) || undefined
      };

      setMessages(prev => [...prev, botMessage]);
      setFlowState(response.flowState || 'template_sent');
      setInteractionCount(prev => prev + 1);
    } catch (error) {
      console.error('Error starting bot:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: "Sorry, I'm having trouble starting the bot. Please try again.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleMenuButtonClick = async (buttonValue) => {
    if (isLocked) return;

    // Handle flow-specific button clicks
    if (flowState === 'template_sent' && buttonValue === 'yes') {
      const userMessage = {
        id: Date.now(),
        text: 'YES',
        sender: 'user',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      setInteractionCount(prev => prev + 1);
      setIsTyping(true);

      try {
        const response = await sendChatbotMessage('__YES_CLICKED__', interactionCount, flowState);
        const botMessage = {
          id: Date.now() + 1,
          text: response.message || response.text || "Great! Please provide your salary.",
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMessage]);
        setFlowState(response.flowState || 'asking_salary');
      } catch (error) {
        console.error('Error handling YES click:', error);
        const errorMessage = {
          id: Date.now() + 1,
          text: "Sorry, I'm having trouble. Please try again.",
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
      }
      return;
    }

    // Add user's selection as a message
    const selectedButton = messages.find(m => m.menuButtons)?.menuButtons?.find(b => b.value === buttonValue);
    const userMessage = {
      id: Date.now(),
      text: selectedButton?.text || buttonValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInteractionCount(prev => prev + 1);
    setIsTyping(true);

    try {
      // Handle special actions
      if (buttonValue === 'human') {
        // Lock chatbot and route to inbox
        await lockChatbot();
        setIsLocked(true);
        
        const lockMessage = {
          id: Date.now() + 1,
          text: "I've connected you with our support team. Your conversation has been routed to the Inbox. Please check your Inbox for further assistance. 👥",
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, lockMessage]);
        
        // Route to inbox after a delay
        setTimeout(() => {
          navigate('/inbox');
          setIsOpen(false);
        }, 2000);
        return;
      }

      // Navigate based on button value
      if (buttonValue === 'dashboard') {
        navigate('/dashboard');
        setIsOpen(false);
        return;
      } else if (buttonValue === 'campaign') {
        navigate('/campaigns');
        setIsOpen(false);
        return;
      } else if (buttonValue === 'message') {
        navigate('/inbox');
        setIsOpen(false);
        return;
      } else if (buttonValue === 'contacts') {
        navigate('/contacts');
        setIsOpen(false);
        return;
      } else if (buttonValue === 'analytics') {
        navigate('/analytics');
        setIsOpen(false);
        return;
      }

      // Send message to backend for other options
      const response = await sendChatbotMessage(buttonValue, interactionCount + 1);
      
      const botMessage = {
        id: Date.now() + 1,
        text: response.message || response.text || "I'm here to help!",
        sender: 'bot',
        timestamp: new Date(),
        menuButtons: response.suggestions?.length > 0 ? response.suggestions.map((sug, idx) => ({
          id: Date.now() + idx,
          text: sug,
          value: sug.toLowerCase().replace(/\s+/g, '_')
        })) : undefined
      };

      setMessages(prev => [...prev, botMessage]);

      // Lock chatbot after 3 interactions (except for human support)
      if (interactionCount >= 2) {
        const lockPrompt = {
          id: Date.now() + 2,
          text: "Would you like to speak with a human agent? I can route this conversation to our support team.",
          sender: 'bot',
          timestamp: new Date(),
          menuButtons: [
            { id: 1, text: 'Yes, connect me', value: 'human' },
            { id: 2, text: 'No, continue', value: 'continue' }
          ]
        };
        setMessages(prev => [...prev, lockPrompt]);
      }
    } catch (error) {
      console.error('Error handling menu button:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: "Sorry, I'm having trouble right now. Please try again.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isTyping || isLocked) return;

    const userMessage = {
      id: Date.now(),
      text: inputMessage.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputMessage.trim();
    setInputMessage('');
    setInteractionCount(prev => prev + 1);
    setIsTyping(true);

    try {
      // Handle flow-specific messages (salary input)
      if (flowState === 'asking_salary' || flowState === 'salary_retry') {
        const response = await sendChatbotMessage(`__SALARY_INPUT__:${messageText}`, interactionCount, flowState);
        
        if (response.isValid === false) {
          // Invalid salary, ask again
          const botMessage = {
            id: Date.now() + 1,
            text: response.message || response.text || "Please enter a valid salary amount (numbers only).",
            sender: 'bot',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, botMessage]);
          setFlowState('salary_retry');
        } else {
          // Valid salary, continue flow
          const botMessage = {
            id: Date.now() + 1,
            text: response.message || response.text || "Thank you! Your information has been recorded. How else can I help you?",
            sender: 'bot',
            timestamp: new Date(),
            menuButtons: response.buttons || response.suggestions?.map((sug, idx) => ({
              id: Date.now() + idx,
              text: sug,
              value: sug.toLowerCase().replace(/\s+/g, '_')
            })) || undefined
          };
          setMessages(prev => [...prev, botMessage]);
          setFlowState(response.flowState || 'completed');
        }
      } else {
        // Regular message handling
        const response = await sendChatbotMessage(messageText, interactionCount);
        
        const botMessage = {
          id: Date.now() + 1,
          text: response.message || response.text || "I'm sorry, I didn't understand that. Can you please rephrase?",
          sender: 'bot',
          timestamp: new Date(),
          menuButtons: response.suggestions?.length > 0 ? response.suggestions.map((sug, idx) => ({
            id: Date.now() + idx,
            text: sug,
            value: sug.toLowerCase().replace(/\s+/g, '_')
          })) : undefined
        };

        setMessages(prev => [...prev, botMessage]);

        // Lock chatbot after 3 interactions
        if (interactionCount >= 2) {
          const lockPrompt = {
            id: Date.now() + 2,
            text: "Would you like to speak with a human agent? I can route this conversation to our support team.",
            sender: 'bot',
            timestamp: new Date(),
            menuButtons: [
              { id: 1, text: 'Yes, connect me', value: 'human' },
              { id: 2, text: 'No, continue', value: 'continue' }
            ]
          };
          setMessages(prev => [...prev, lockPrompt]);
        }
      }
    } catch (error) {
      console.error('Error sending chatbot message:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: "Sorry, I'm having trouble connecting right now. Please try again later.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isAuthenticated()) {
    return null; // Don't show chatbot if not authenticated
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      {/* Chat Button — matches dashboard CTA / logo blues */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 p-3.5 text-white shadow-xl shadow-sky-600/40 ring-2 ring-white/30 transition-all duration-300 hover:scale-110 hover:shadow-2xl hover:shadow-sky-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          aria-label="Open chatbot"
        >
          <svg className="relative z-[1] h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="absolute inset-0 rounded-full bg-sky-400/30 animate-ping opacity-40" aria-hidden />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="flex h-[600px] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] animate-fade-in-up flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl shadow-sky-900/15 ring-1 ring-gray-100/90 sm:w-96">
          {/* Header — aligned with app top bars (sky → blue) */}
          <div className="relative flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-sky-600 via-sky-600 to-blue-700 px-4 py-4 text-white shadow-md shadow-sky-900/20 sm:px-5 sm:py-5">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" aria-hidden />
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 shadow-inner ring-1 ring-white/30 backdrop-blur-sm sm:h-12 sm:w-12">
                <svg className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-bold tracking-tight sm:text-base">Waabizx Support</h3>
                <p className="text-xs font-medium text-sky-100/95">We&apos;re here to help ✨</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {!flowState && (
                <button
                  type="button"
                  onClick={handleStartBot}
                  disabled={isTyping || isLocked}
                  className="rounded-lg border border-white/40 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-xs"
                  title="Start Bot"
                >
                  Start Bot
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 text-white/95 transition-all hover:bg-white/15 active:scale-95"
                aria-label="Close chatbot"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages — same soft page background as main content */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-sky-50/60 via-white to-gray-50/80 p-4 sm:p-5">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="animate-fade-in">
                  <div className={`mb-2 flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 sm:max-w-[85%] ${
                        message.sender === 'user'
                          ? 'rounded-br-md bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-500/30'
                          : 'rounded-bl-md border border-gray-100/90 bg-white/95 text-gray-800 ring-1 ring-gray-100/80'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                      <p
                        className={`mt-2 text-[11px] tabular-nums ${
                          message.sender === 'user' ? 'text-sky-100/90' : 'text-gray-400'
                        }`}
                      >
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>

                  {message.menuButtons && message.menuButtons.length > 0 && !isLocked && (
                    <div className="mt-2 grid grid-cols-2 gap-2 animate-fade-in sm:gap-2.5">
                      {message.menuButtons.map((button) => (
                        <button
                          key={button.id}
                          type="button"
                          onClick={() => handleMenuButtonClick(button.value)}
                          disabled={isTyping || isLocked}
                          className="rounded-xl border-2 border-sky-100 bg-white px-3 py-2.5 text-left text-[11px] font-semibold leading-snug text-sky-800 shadow-sm ring-1 ring-gray-100/60 transition-all hover:border-sky-300 hover:bg-sky-50/80 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
                        >
                          {button.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start animate-fade-in">
                  <div className="rounded-2xl rounded-bl-md border border-gray-100/90 bg-white/95 px-5 py-3 shadow-sm ring-1 ring-gray-100/80">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: '0ms' }} />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: '150ms' }} />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input — matches form controls across the app */}
          <div className="rounded-b-2xl border-t border-gray-100/90 bg-gradient-to-r from-white via-sky-50/20 to-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:p-4">
            {isLocked ? (
              <div className="rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-blue-50/50 px-3 py-3 text-center ring-1 ring-sky-100/60 sm:px-4">
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-sky-900">
                  <svg className="h-5 w-5 shrink-0 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Conversation routed to Inbox. Check your Inbox for support.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex gap-2 sm:gap-3">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="w-full rounded-xl border-2 border-gray-200/90 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-3"
                    disabled={isTyping || isLocked}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isTyping || isLocked}
                  className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:px-5 sm:py-3"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Chatbot;

