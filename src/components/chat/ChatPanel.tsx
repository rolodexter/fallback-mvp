import React, { useState, useRef, useEffect } from 'react';
import { sendChat, type Answer, type ChatPayload } from '@/services/chatClient';
import { routeMessage } from '@/data/router/topicRouter';
import { verifyChatClientConfig } from '../../services/verify';
import '@/components/widgets/Widget.css';
import './ChatPanel.css';

type MessageType = 'user' | 'bot' | 'error';

type Message = {
  id: string;
  text: string;
  type: MessageType;
  timestamp: Date;
};

// Simple 5-card rail based on current domain, with skeletons to avoid layout shift
const WidgetRail: React.FC<{ domain?: string; loading?: boolean }> = ({ domain, loading }) => {
  const getTitles = (d?: string): string[] => {
    switch (d) {
      case 'business_units':
        return [
          'YoY BU sparkline',
          'Top BU Δ',
          'Last month gross',
          'MoM Δ',
          'Coverage'
        ];
      case 'counterparties':
        return [
          'Top 3 counterparties',
          'YTD gross',
          'New vs returning',
          'Concentration index',
          'Coverage'
        ];
      case 'performance':
        return [
          '12/24m bar+line',
          'Last 3-m Δ%',
          'Seasonality hint',
          'Last outlier month',
          'Coverage'
        ];
      default:
        return [
          'Overview',
          'Trend',
          'Top movers',
          'Recent change',
          'Coverage'
        ];
    }
  };
  const titles = getTitles(domain);
  return (
    <div className="widget-rail">
      {titles.map((t, i) => (
        <div key={i} className="widget rail-card">
          <div className="widget-header">
            <h3 className="widget-title">{t}</h3>
          </div>
          <div className={"widget-content" + (loading ? ' skeleton' : '')}>
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
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
    const { platform, endpointHint } = verifyChatClientConfig();
    
    // Make config available globally for debugging
    window.__riskillDebug = window.__riskillDebug || {};
    window.__riskillDebug.platform = platform;
    window.__riskillDebug.endpoint = endpointHint;
    // Skip setting debug if it's not available
    
    window.addEventListener('popstate', checkDebugMode);
    checkDebugMode();
    // No client init required when using named sendChat
    
    return () => {
      window.removeEventListener('popstate', checkDebugMode);
    };
  }, []);

  // Generate a unique ID for messages
  const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  // Example chip suggestions for intro/nodata responses
  const exampleChips = [
    'Z001 June snapshot',
    'Top counterparties YTD',
    'Monthly gross trend'
  ];

  // Handle chip click
  const handleChipClick = (chipText: string) => {
    setMessage(chipText);
  };

  // Renderer accepts answer fields needed for diagnostics
  type RenderableAnswer = Pick<Answer, 'text' | 'kpis' | 'mode' | 'provenance' | 'reason' | 'abstain_reason'>;

  // Function to render an answer to the chat
  const renderAnswer = (ans: RenderableAnswer) => {
    if (!ans || !ans.text) {
      const errorMessage: Message = {
        id: generateId(),
        text: "No answer text returned. Check /api/chat and network payload.",
        type: 'error',
        timestamp: new Date()
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      return;
    }

    // If server indicates abstain/nodata, surface diagnostics prominently
    if (ans.mode && ans.mode !== 'strict') {
      const prov = ans.provenance || {};
      const reason = ans.reason || ans.abstain_reason;
      const parts: string[] = [];
      if (prov.tag) parts.push(`tag=${prov.tag}`);
      if (prov.source) parts.push(`source=${prov.source}`);
      if (reason) parts.push(`reason=${reason}`);
      if (prov.error) parts.push(`error=${prov.error}`);
      const diag = parts.length ? `\n(${parts.join(' | ')})` : '';
      const errorMessage: Message = {
        id: generateId(),
        text: `${ans.text}${diag}`,
        type: 'error',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    // Render the main answer text
    const botMessage: Message = {
      id: generateId(),
      text: ans.text,
      type: 'bot',
      timestamp: new Date()
    };
    setMessages(prevMessages => [...prevMessages, botMessage]);
    
    // Include KPIs if provided
    if (Array.isArray(ans.kpis) && ans.kpis.length) {
      const kpiText = ans.kpis.map(k => `• ${k.label}: ${k.value}`).join('\n');
      const kpiMessage: Message = {
        id: generateId(),
        text: kpiText,
        type: 'bot',
        timestamp: new Date()
      };
      setMessages(prevMessages => [...prevMessages, kpiMessage]);
    }

    // Update chat history with the new exchange
    setChatHistory(prev => [
      ...prev,
      { role: 'assistant', content: ans.text }
    ]);
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

    // Add message to UI
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setIsLoading(true);
    setMessage('');
    
    // Update chat history
    setChatHistory(prev => [...prev, { role: 'user', content: message }]);

    // Determine the endpoint based on platform
    const endpoint = (import.meta.env.VITE_DEPLOY_PLATFORM === "netlify")
      ? "/.netlify/functions/chat"
      : "/api/chat";

    // Step 1: Deterministic routing for canonical prompts
    const r = routeMessage(message);
    console.info('[ROUTE]', r);
    
    // If no valid route, show intro message
    if (!r?.domain || !r.template_id) {
      console.info('[ChatPanel] No domain/template detected, showing intro/nodata locally');
      setIsLoading(false);
      
      // Show intro/nodata with example chips and scope hint
      const introMessage: Message = {
        id: generateId(),
        text: "Stage-A (mock): deterministic answers for BU snapshot, counterparties YTD, monthly gross trend.",
        type: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, introMessage]);
      return;
    }
    
    // Update UI state with detected domain and template
    setDomain(r.domain);
    setTemplateId(r.template_id);

    try {
      // Stage-A payload typing for compile-time safety
      const payload: ChatPayload = {
        message,
        router: { domain: r.domain },
        template: { id: r.template_id },
        params: r.params || {},
        endpoint
      };

      const answer: Answer = await sendChat(payload);
      console.info('[ANSWER]', answer);
      renderAnswer(answer);
    } catch (error) {
      // Handle error in the response
      console.error('[ChatPanel] Error:', error);
      
      const errorMessage: Message = {
        id: generateId(),
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        {import.meta.env.MODE === 'development' && domain && (
          <div className="chat-domain">Domain: {domain}</div>
        )}
        
        {/* Debug overlay */}
        {showDebug && (
          <div className="debug-overlay">
            <h4>Debug Info</h4>
            <div><strong>Endpoint:</strong> {window.__riskillDebug?.endpoint || 'Not set'}</div>
            <div><strong>Platform:</strong> {window.__riskillDebug?.platform || 'Not detected'}</div>
            <div><strong>Router Domain:</strong> {domain || 'none'}</div>
            <div><strong>Template ID:</strong> {templateId || 'none'}</div>
            <div><strong>Chat History:</strong> {chatHistory.length} messages</div>
          </div>
        )}
      </div>
      {/* Top 5-card rail: responsive, always renders exactly five cards */}
      <WidgetRail domain={domain} loading={isLoading} />
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <p>Welcome to the Finance Assistant!</p>
            <p>How can I help you with your financial data?</p>
            <div className="example-chips">
              {exampleChips.map((chip, index) => (
                <button 
                  key={index} 
                  className="chip" 
                  onClick={() => handleChipClick(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.type}-message`}>
              <div className="message-content">{msg.text}</div>
              {msg.type === 'bot' && msg.text.includes("Stage-A") && (
                <div className="example-chips">
                  {exampleChips.map((chip, index) => (
                    <button 
                      key={index} 
                      className="chip" 
                      onClick={() => handleChipClick(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
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
