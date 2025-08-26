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
  widget?: any;
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

// Exec-friendly widget renderer and numeric formatting
const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const WidgetRenderer: React.FC<{ widget: any }> = ({ widget }) => {
  if (!widget) return null;
  if (widget.type === 'table' && Array.isArray(widget.columns) && Array.isArray(widget.rows)) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto text-sm">
          <thead>
            <tr>
              {widget.columns.map((c: string) => (
                <th key={c} className="px-3 py-2 text-left">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widget.rows.map((r: any[], i: number) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-2 border-t">
                    {typeof cell === 'number' ? nf.format(cell) : String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(widget, null, 2)}</pre>
  );
};

// Chat history format required by chatClient.sendChat
type ChatHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
};
 
 // Short, common follow-ups that lack domain cues
 const FOLLOWUP_RE = /^(tell me more|continue|more details?|details|expand|what else|go on|show more|drill ?down|yes,? continue)\b/i;

const ChatPanel: React.FC = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [domain, setDomain] = useState<string | undefined>(undefined);
  const [templateId, setTemplateId] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [showProvenance, setShowProvenance] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAnswerRawRef = useRef<any>(null);
  const lastAnswerTextRef = useRef<string>('');
  // Remember last successful deterministic route for follow-ups like "tell me more"
  const lastRouteRef = useRef<{ domain?: string; template_id?: string; params?: Record<string, any> } | null>(null);

  // --- QA helpers: copy to clipboard ---
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {
        console.warn('Copy failed:', e);
      }
    }
  };
  const handleCopyLastText = () => {
    if (lastAnswerTextRef.current) copyToClipboard(lastAnswerTextRef.current);
  };
  const handleCopyLastJson = () => {
    if (lastAnswerRawRef.current) copyToClipboard(JSON.stringify(lastAnswerRawRef.current, null, 2));
  };

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
  type RenderableAnswer = Pick<Answer, 'text' | 'kpis' | 'widgets' | 'mode' | 'provenance' | 'reason' | 'abstain_reason' | 'meta'>;

  // Function to render an answer to the chat
  const renderAnswer = (ans: RenderableAnswer) => {
    if (!ans) {
      const errorMessage: Message = {
        id: generateId(),
        text: "No answer returned. Check /api/chat and network payload.",
        type: 'error',
        timestamp: new Date()
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      return;
    }

    // Prefer top-level fields, but fall back to templateOutput for backward compatibility
    const displayText = ans.text ?? (ans as any)?.templateOutput?.text ?? 'No text.';
    // Keep last answer for quick QA copy actions
    lastAnswerRawRef.current = ans;
    lastAnswerTextRef.current = displayText;
    const widgetData = (ans as any)?.widgets ?? (ans as any)?.templateOutput?.widgets ?? null;

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
        text: `${displayText}${diag}`,
        type: 'error',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    // Render the main answer text
    const botMessage: Message = {
      id: generateId(),
      text: displayText,
      type: 'bot',
      timestamp: new Date()
    };
    setMessages(prevMessages => [...prevMessages, botMessage]);
    
    // Include KPIs if provided
    if (Array.isArray(ans.kpis) && ans.kpis.length) {
      const kpiText = ans.kpis
        .map(k => {
          const val = typeof k.value === 'number' ? nf.format(k.value) : String(k.value);
          return `• ${k.label}: ${val}`;
        })
        .join('\n');
      const kpiMessage: Message = {
        id: generateId(),
        text: kpiText,
        type: 'bot',
        timestamp: new Date()
      };
      setMessages(prevMessages => [...prevMessages, kpiMessage]);
    }

    // Include widgets (rendered as compact JSON) if provided
    if (widgetData) {
      const widgetsMessage: Message = {
        id: generateId(),
        text: '',
        type: 'bot',
        timestamp: new Date(),
        widget: widgetData,
      };
      setMessages(prev => [...prev, widgetsMessage]);
    }

    // Add concise provenance footer for traceability
    const prov = ans.provenance || {};
    const footerParts: string[] = [];
    const footerDomain = ans.meta?.domain || domain || 'n/a';
    if (prov.source) footerParts.push(`source=${prov.source}`);
    if (prov.tag) footerParts.push(`tag=${prov.tag}`);
    if (prov.template_id || templateId) footerParts.push(`template=${prov.template_id || templateId}`);
    footerParts.push(`domain=${footerDomain}`);
    if (ans.meta?.confidence) footerParts.push(`confidence=${ans.meta.confidence}`);
    if (prov.snapshot) footerParts.push(`snapshot=${prov.snapshot}`);
    if (prov.error) footerParts.push(`error=${prov.error}`);
    const footerText = `— provenance: ${footerParts.join(' | ')}`;
    const footerMessage: Message = {
      id: generateId(),
      text: footerText,
      type: 'bot',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, footerMessage]);

    // Update chat history with the new exchange
    setChatHistory(prev => [
      ...prev,
      { role: 'assistant', content: displayText }
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
    
    // Prepare chat history to send with this turn (cap to last 8, sanitize)
    const capped = chatHistory.slice(-8);
    const historyToSend: ChatHistoryEntry[] = [
      ...capped.map(h => ({ role: h.role, content: String(h.content ?? '').trim() })),
      { role: 'user', content: String(message).trim() }
    ];
    setChatHistory(historyToSend);

    // Determine the endpoint based on platform
    const endpoint = (import.meta.env.VITE_DEPLOY_PLATFORM === "netlify")
      ? "/.netlify/functions/chat"
      : "/api/chat";

    // Step 1: Deterministic routing for canonical prompts (client hint only)
    const r = routeMessage(message);
    console.info('[ROUTE]', r);
    // Apply current deterministic route if present; otherwise reuse last successful route only for follow-ups
    const looksLikeFollowup = FOLLOWUP_RE.test(message);
    const routedTemplateId = (r as any)?.template_id ?? (r as any)?.template;
    let applied: any = (r && r.domain && routedTemplateId) ? { ...r, template_id: routedTemplateId } : undefined;
    if (!applied && looksLikeFollowup && lastRouteRef.current) {
      applied = lastRouteRef.current;
    }
    if (applied && applied.domain && applied.template_id) {
      setDomain(applied.domain);
      setTemplateId(applied.template_id);
      // Cache as last successful route for subsequent short follow-ups
      lastRouteRef.current = applied;
    } else {
      setDomain(undefined);
      setTemplateId('');
    }

    try {
      // Stage-A payload typing for compile-time safety
      const client_hints = lastRouteRef.current ? {
        prevDomain: lastRouteRef.current.domain ?? null,
        prevTemplate: lastRouteRef.current.template_id ?? null,
        prevParams: lastRouteRef.current.params ?? null,
        prevTop: (typeof (lastRouteRef.current.params?.top) === 'number') ? lastRouteRef.current.params.top : null
      } : undefined;
      const payload: ChatPayload = {
        message,
        router: applied && applied.domain && applied.template_id ? {
          domain: applied.domain,
          template_id: applied.template_id,
          params: (applied.params ?? {})
        } : undefined,
        template: { id: (applied as any)?.template_id },
        params: (applied as any)?.params || {},
        endpoint,
        history: historyToSend,
        client_hints
      };

      const answer: Answer = await sendChat(payload);
      console.info('[ANSWER]', answer);
      renderAnswer(answer);
      // Refresh lastRouteRef from server echo if available
      const srvDomain = answer?.meta?.domain;
      const srvTemplateId = (answer?.provenance as any)?.template_id;
      if (srvDomain && srvTemplateId) {
        lastRouteRef.current = {
          domain: srvDomain,
          template_id: srvTemplateId,
          params: (applied as any)?.params ?? {}
        };
      }
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
        {/* Lightweight QA tools */}
        <div className="chat-tools">
          <label className="prov-toggle">
            <input
              type="checkbox"
              checked={showProvenance}
              onChange={(e) => setShowProvenance(e.target.checked)}
            />
            <span>Show provenance</span>
          </label>
          <button className="tool-btn" onClick={handleCopyLastText} title="Copy last answer text">Copy text</button>
          <button className="tool-btn" onClick={handleCopyLastJson} title="Copy last answer JSON">Copy JSON</button>
        </div>

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
          messages
            .filter((m) => showProvenance || !(m.text || '').startsWith('— provenance'))
            .map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.type}-message`}>
              <div className="message-content">
                {msg.widget ? <WidgetRenderer widget={msg.widget} /> : msg.text}
              </div>
              <div className="message-actions">
                {msg.widget ? (
                  <button className="copy-btn" onClick={() => copyToClipboard(JSON.stringify(msg.widget, null, 2))}>Copy</button>
                ) : (
                  <button className="copy-btn" onClick={() => copyToClipboard(msg.text)}>Copy</button>
                )}
              </div>
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
