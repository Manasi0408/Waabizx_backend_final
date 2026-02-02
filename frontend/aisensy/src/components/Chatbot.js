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
      text: "Hello! 👋 I'm here to help you with AiSensy. How can I assist you today?",
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
            text: "Hello! 👋 I'm here to help you with AiSensy. How can I assist you today?",
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
    <div className="fixed bottom-4 right-4 z-50">
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full p-3.5 shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center relative group"
          aria-label="Open chatbot"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {/* Pulse animation */}
          <span className="absolute inset-0 rounded-full bg-blue-600 animate-ping opacity-20"></span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] sm:w-96 h-[600px] max-h-[calc(100vh-2rem)] flex flex-col border border-gray-100 overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white p-5 rounded-t-2xl flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-25 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-base">AiSensy Support</h3>
                <p className="text-xs text-blue-100 font-medium">We're here to help ✨</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!flowState && (
                <button
                  onClick={handleStartBot}
                  disabled={isTyping || isLocked}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Start Bot"
                >
                  Start Bot
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-gray-200 transition-all duration-200 p-2 rounded-full hover:bg-white hover:bg-opacity-20 active:scale-95"
                aria-label="Close chatbot"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-5 bg-gradient-to-b from-gray-50 to-white">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="animate-fade-in">
                  <div
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-md transition-all duration-200 ${
                        message.sender === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-sm'
                          : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
                      <p className={`text-xs mt-2 ${
                        message.sender === 'user' ? 'text-blue-100' : 'text-gray-400'
                      }`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Menu Buttons */}
                  {message.menuButtons && message.menuButtons.length > 0 && !isLocked && (
                    <div className="mt-3 flex flex-wrap gap-2 justify-start animate-fade-in">
                      {message.menuButtons.map((button) => (
                        <button
                          key={button.id}
                          onClick={() => handleMenuButtonClick(button.value)}
                          disabled={isTyping || isLocked}
                          className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md hover:scale-105 active:scale-95"
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
                  <div className="bg-white text-gray-800 rounded-2xl rounded-bl-sm px-5 py-3 shadow-md border border-gray-100">
                    <div className="flex gap-1.5 items-center">
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-100 p-4 bg-gradient-to-r from-white to-gray-50 rounded-b-2xl shadow-inner">
            {isLocked ? (
              <div className="text-center py-3 px-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                <p className="text-sm text-blue-700 font-medium flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Conversation routed to Inbox. Check your Inbox for support.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isTyping || isLocked}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isTyping || isLocked}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-5 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-xl active:scale-95"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

