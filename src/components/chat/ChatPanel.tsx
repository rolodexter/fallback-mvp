import React, { useState, useRef, useEffect } from 'react';
import { chatClient } from '../../services/chatClient';
import { routeMessage } from '../../data/router/router';
import { getTemplateSummaryFunction } from '../../data/templates';

type MessageType = 'user' | 'bot' | 'error';

type Message = {
  id: string;
  text: string;
  type: MessageType;
  timestamp: Date;
};

const ChatPanel: React.FC = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [domain, setDomain] = useState<string | undefined>(undefined);
  const [routerConfidence, setRouterConfidence] = useState<number>(0);
  const [templateId, setTemplateId] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Check for debug mode on mount and URL changes
  useEffect(() => {
    const checkDebugMode = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const debug = urlParams.get('debug');
      setShowDebug(debug === '1');
    };
    
    // Initialize chatClient
    const initClient = async () => {
      await chatClient.init();
    };
    
    window.addEventListener('popstate', checkDebugMode);
    checkDebugMode();
    initClient();
    
    return () => {
      window.removeEventListener('popstate', checkDebugMode);
    };
  }, []);

  // Generate a unique ID for messages
  const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  // Handle send message
  const handleSendMessage = async () => {
    if (!message.trim()) return;

    // Add user message to chat
    const userMessage: Message = {
      id: generateId(),
      text: message,
      type: 'user',
      timestamp: new Date()
    };

    // Route the message to determine domain
    const routeResult = routeMessage(message);
    const newDomain = routeResult.domain !== 'none' ? routeResult.domain : domain;
    
    // Get template if domain is valid
    if (newDomain && newDomain !== 'none') {
      const templateFn = getTemplateSummaryFunction(newDomain);
      if (templateFn) {
        // Use template function for future summary display
        setTemplateId(newDomain);
      }
    }
    
    // Update confidence
    setRouterConfidence(routeResult.confidence);
    
    // Only set domain if it's different from none
    if (newDomain !== 'none') {
      setDomain(newDomain);
    }
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setIsLoading(true);
    setMessage('');

    try {
      // Send message to API
      const response = await chatClient.sendMessage(message, newDomain);

      // Handle successful response
      if (response.reply) {
        const botMessage: Message = {
          id: generateId(),
          text: response.reply,
          type: 'bot',
          timestamp: new Date()
        };
        
        setMessages(prevMessages => [...prevMessages, botMessage]);
        
        // Update domain if it was detected
        if (response.domain) {
          setDomain(response.domain);
        }
      }
      
      // Handle error in the response
      if (response.error) {
        const errorMessage: Message = {
          id: generateId(),
          text: `Error: ${response.error}`,
          type: 'error',
          timestamp: new Date()
        };
        
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      }
    } catch (error) {
      // Handle unexpected errors
      const errorMessage: Message = {
        id: generateId(),
        text: `Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        timestamp: new Date()
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Format timestamp
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>Chat Assistant</h2>
        {domain && <div className="chat-domain">Domain: {domain}</div>}
        
        {/* Debug overlay */}
        {showDebug && (
          <div className="debug-overlay">
            <h4>Debug Info</h4>
            <div><strong>Endpoint:</strong> {window.__riskillDebug?.endpoint || 'Not set'}</div>
            <div><strong>Platform:</strong> {window.__riskillDebug?.platform || 'Not detected'}</div>
            <div><strong>Router Domain:</strong> {domain || 'none'}</div>
            <div><strong>Router Confidence:</strong> {routerConfidence.toFixed(2)}</div>
            <div><strong>Template ID:</strong> {templateId || 'none'}</div>
          </div>
        )}
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <p>Welcome to the Finance Assistant!</p>
            <p>How can I help you with your financial data?</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.type}-message`}>
              <div className="message-content">{msg.text}</div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="chat-message bot-message loading">
            <div className="loading-indicator">
              <span>.</span><span>.</span><span>.</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input">
        <textarea 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={isLoading}
        />
        <button 
          onClick={handleSendMessage}
          disabled={!message.trim() || isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
