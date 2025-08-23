import React, { useState, useRef, useEffect } from 'react';
import { chatClient } from '../../services/chatClient';
import { routeMessage } from '../../data/router/router';
import { getTemplateSummaryFunction } from '../../data/templates';
import { verifyChatClientConfig } from '../../services/verify';

type MessageType = 'user' | 'bot' | 'error';

type Message = {
  id: string;
  text: string;
  type: MessageType;
  timestamp: Date;
};

// Chat history format required by chatClient.sendChat
type ChatHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
};

const ChatPanel: React.FC = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
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
    
    // Verify configuration and initialize debug info
    const { platform, endpointHint, debug } = verifyChatClientConfig();
    
    // Make config available globally for debugging
    window.__riskillDebug = window.__riskillDebug || {};
    window.__riskillDebug.platform = platform;
    window.__riskillDebug.endpoint = endpointHint;
    window.__riskillDebug.debug = debug;
    
    // Initialize chatClient with verified config
    const initClient = async () => {
      // Pass the verified endpoint if needed
      await chatClient.init(endpointHint);
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
    setRouterConfidence(routeResult.confidence);
    const nextDomain = routeResult.domain !== 'none' ? routeResult.domain : undefined;
    
    // Add strict client fallback for non-domain messages
    if (!nextDomain || routeResult.domain === 'none') {
      console.info('[ChatPanel] No domain detected, showing intro/nodata locally');
      
      // Show intro/nodata locally and return
      const introMessage: Message = {
        id: generateId(),
        text: "Try asking about Business Units (YoY), Top Counterparties, or Monthly Gross Trend.",
        type: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMessage, introMessage]);
      setMessage('');
      return;
    }
    
    // Get template if domain is valid
    if (nextDomain) {
      const templateFn = getTemplateSummaryFunction(nextDomain);
      if (templateFn) {
        // Use template function for future summary display
        setTemplateId(nextDomain);
      }
    }
    
    // Set the detected domain
    setDomain(nextDomain);
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setIsLoading(true);
    setMessage('');

    try {
      // Send message to API with routing context
      const response = await chatClient.sendChat({
        message,
        chatHistory: chatHistory.map(entry => ({
          type: entry.role === 'user' ? 'user' : 'bot',
          text: entry.content
        })),
        router: routeResult,
        template: nextDomain
      });

      // Handle successful response
      if (response.text) {
        const botMessage: Message = {
          id: generateId(),
          text: response.text,
          type: 'bot',
          timestamp: new Date()
        };
        
        setMessages(prevMessages => [...prevMessages, botMessage]);
        
        // Update domain if it was detected
        if (response.meta?.domain) {
          setDomain(response.meta.domain);
        }
        
        // Update chat history with the new exchange
        setChatHistory(prev => [
          ...prev,
          { role: 'user', content: message },
          { role: 'assistant', content: response.text }
        ]);
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
            <div><strong>Chat History:</strong> {chatHistory.length} messages</div>
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
