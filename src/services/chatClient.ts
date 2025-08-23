/**
 * Chat client service to handle API calls to both Netlify and Vercel endpoints
 * This service automatically selects the appropriate endpoint based on the current deployment platform
 * Includes support for grounded chat with domain detection and templates
 */

import { detectTopic } from "../data/router/router";
import { runTemplate } from "../data/templates";
import { executeBigQuery } from "./bigQueryClient";

// Request and response type definitions
type ChatResponse = {
  text: string; // Changed from reply to text to match the backend response
  meta?: {
    domain: string | null;
    confidence: number;
    groundingType: string | null;
  };
  error?: string;
};

export type GroundingPayload = {
  domain: string | null;
  confidence: number;
  groundingType: "intro" | "drilldown" | "no_data" | null;
  kpiSummary?: string | null;
  templateOutput?: string | null;
  bigQueryData?: any[] | null;
};

// Debug info container for development purposes
declare global {
  interface Window {
    __riskillDebug: {
      endpoint: string;
      platform: string;
      routerDomain?: string;
      routerConfidence?: number;
      routerGroundingType?: string;
      groundingType?: string;
      templateId?: string;
      responseDomain?: string;
      responseGroundingType?: string;
      responseConfidence?: number;
      lastRequestTime?: string;
      lastRequestEndpoint?: string;
      lastResponseTime?: string;
      lastResponseStatus?: number;
      lastError?: string;
      errors?: string[];
      initTime?: string;
      initSource?: string;
    };
  }
}

// Initialize debug container
if (typeof window !== 'undefined') {
  window.__riskillDebug = window.__riskillDebug || { endpoint: '', platform: '' };
}

/**
 * Verify that chat client is properly configured for production use
 * @returns {Object} Verification result with success and issues
 */
export function verifyChatClientConfig() {
  const debug = window.__riskillDebug || {};
  const result: {
    success: boolean;
    serverlessOnly: boolean;
    platform: string;
    endpoint: string;
    issues: string[];
    details: Record<string, any>;
  } = {
    success: true,
    serverlessOnly: true,
    platform: debug.platform || 'not detected',
    endpoint: debug.endpoint || 'not configured',
    issues: [],
    details: {}
  };
  
  // Check if platform is properly detected
  if (!debug.platform) {
    result.success = false;
    result.issues.push('Platform not detected');
  }
  
  // Check if endpoint is properly configured
  if (!debug.endpoint) {
    result.success = false;
    result.issues.push('Endpoint not configured');
  } else {
    // Ensure endpoint is a serverless endpoint
    const isNetlifyEndpoint = debug.endpoint.includes('/.netlify/functions/');
    const isVercelEndpoint = debug.endpoint.startsWith('/api/');
    if (!isNetlifyEndpoint && !isVercelEndpoint) {
      result.success = false;
      result.serverlessOnly = false;
      result.issues.push('Not using a serverless endpoint');
    }
  }
  
  // Check for initialization errors
  if (debug.errors && debug.errors.length > 0) {
    result.success = false;
    result.issues.push('Initialization errors detected');
    result.details.errors = debug.errors;
  }
  
  // Check last request/response
  if (debug.lastRequestEndpoint) {
    result.details.lastRequest = {
      time: debug.lastRequestTime,
      endpoint: debug.lastRequestEndpoint,
      responseStatus: debug.lastResponseStatus,
      responseTime: debug.lastResponseTime,
      error: debug.lastError
    };
    
    // Ensure last request was to a serverless endpoint
    const isNetlifyRequest = debug.lastRequestEndpoint.includes('/.netlify/functions/');
    const isVercelRequest = debug.lastRequestEndpoint.startsWith('/api/');
    if (!isNetlifyRequest && !isVercelRequest) {
      result.success = false;
      result.serverlessOnly = false;
      result.issues.push('Last request was not to a serverless endpoint');
    }
  }
  
  // Add routing info to details
  if (debug.routerDomain) {
    result.details.routing = {
      domain: debug.routerDomain,
      confidence: debug.routerConfidence,
      groundingType: debug.groundingType,
      responseDomain: debug.responseDomain,
      responseGroundingType: debug.responseGroundingType
    };
  }
  
  return result;
}

export const chatClient = {
  endpoint: '',
  initialized: false,

  /**
   * Initialize the chat client with the proper platform configuration
   * @returns {Object} Initialization result with success and diagnostic info
   */
  async init() {
    if (this.initialized) {
      return {
        success: true,
        platform: window.__riskillDebug.platform,
        endpoint: this.endpoint,
        message: 'Already initialized'
      };
    }
    
    const deployPlatform = import.meta?.env?.VITE_DEPLOY_PLATFORM;
    const initResult: {
      success: boolean;
      platform: string | null;
      endpoint: string | null;
      message: string;
      diagnostics: Record<string, any>;
    } = {
      success: false,
      platform: null,
      endpoint: null,
      message: '',
      diagnostics: {}
    };
    
    if (deployPlatform) {
      if (deployPlatform === 'netlify') {
        this.endpoint = '/.netlify/functions/chat';
        window.__riskillDebug.endpoint = this.endpoint;
        window.__riskillDebug.platform = 'netlify';
        initResult.platform = 'netlify';
        initResult.endpoint = this.endpoint;
        initResult.message = 'Initialized from VITE_DEPLOY_PLATFORM env var';
      } else if (deployPlatform === 'vercel') {
        this.endpoint = '/api/chat';
        window.__riskillDebug.endpoint = this.endpoint;
        window.__riskillDebug.platform = 'vercel';
        initResult.platform = 'vercel';
        initResult.endpoint = this.endpoint;
        initResult.message = 'Initialized from VITE_DEPLOY_PLATFORM env var';
      } else {
        console.error(`Unknown platform: ${deployPlatform}`);
        initResult.message = `Unknown platform: ${deployPlatform}`;
        window.__riskillDebug.errors = window.__riskillDebug.errors || [];
        window.__riskillDebug.errors.push(`Unknown platform: ${deployPlatform}`);
      }
    } else {
      console.log('No VITE_DEPLOY_PLATFORM found, attempting to detect...');
      initResult.message = 'No VITE_DEPLOY_PLATFORM found, attempting to detect';
      initResult.diagnostics.envVarMissing = true;
      
      // Try health endpoints to determine platform
      try {
        const vercelHealth = await fetch('/api/health');
        if (vercelHealth.ok) {
          this.endpoint = '/api/chat';
          window.__riskillDebug.platform = 'vercel';
          initResult.platform = 'vercel';
          initResult.endpoint = this.endpoint;
          initResult.message += ', detected Vercel via health check';
          console.log('Detected Vercel platform via health check');
        } else {
          const netlifyHealth = await fetch('/.netlify/functions/health');
          if (netlifyHealth.ok) {
            this.endpoint = '/.netlify/functions/chat';
            window.__riskillDebug.platform = 'netlify';
            initResult.platform = 'netlify';
            initResult.endpoint = this.endpoint;
            initResult.message += ', detected Netlify via health check';
            console.log('Detected Netlify platform via health check');
          } else {
            console.error('Could not detect platform');
            initResult.message += ', could not detect platform via health checks';
            window.__riskillDebug.errors = window.__riskillDebug.errors || [];
            window.__riskillDebug.errors.push('Could not detect platform via health checks');
          }
        }
      } catch (e) {
        console.error('Error detecting platform:', e);
        initResult.message += ', error during platform detection';
        initResult.diagnostics.error = e instanceof Error ? e.message : String(e);
        window.__riskillDebug.errors = window.__riskillDebug.errors || [];
        window.__riskillDebug.errors.push('Error detecting platform: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
    
    // Store initialization time for runtime verification
    window.__riskillDebug.initTime = new Date().toISOString();
    window.__riskillDebug.initSource = initResult.message;
    
    this.initialized = Boolean(this.endpoint);
    initResult.success = this.initialized;
    
    console.log(`Chat client initialized for platform: ${window.__riskillDebug.platform}`);
    console.log(`Using endpoint: ${this.endpoint}`);
    
    return initResult;
  },

  /**
   * Build a grounded request payload with domain detection, BigQuery data, and template output
   * @param userText The user message
   * @param history Array of previous messages in the conversation
   * @returns A grounded request payload
   */
  async buildGroundedRequest(userText: string, history: Array<{role: "user" | "assistant", content: string}> = []) {
    // Detect the topic from the user message
    const detection = detectTopic(userText);
    
    let bigQueryData = null;
    let groundingType = detection?.groundingType ?? null;
    let tmpl: { kpiSummary: string | null, templateOutput: string | null } = { kpiSummary: null, templateOutput: null };
    
    // Get BigQuery data if we have a valid domain
    if (detection?.domain && detection.domain !== 'none') {
      try {
        // Map domain to BigQuery template ID
        const templateMap: Record<string, string> = {
          'performance': 'business_units_snapshot_yoy_v1',
          'counterparties': 'customers_top_n',
          'risk': 'risks_summary',
          'profitability': 'profitability_by_business_unit_v1',
          'regional': 'regional_revenue_trend_24m_v1'
        };
        
        const templateId = templateMap[detection.domain];
        
        if (templateId) {
          // Execute BigQuery query based on domain
          let params = {};
          
          // Set parameters based on user query
          if (templateId === 'customers_top_n') {
            params = { limit: 5 };
          } else if (templateId === 'profitability_by_business_unit_v1') {
            const currentYear = new Date().getFullYear();
            params = { year: currentYear - 1 };
          } else if (templateId === 'regional_revenue_trend_24m_v1') {
            params = {}; // No parameters needed, but could add region filter if specified in message
          }
          
          // Get data from BigQuery
          const response = await executeBigQuery(templateId, params);
          
          if (response.success && response.rows && response.rows.length > 0) {
            // Store BigQuery data for grounding
            bigQueryData = response.rows;
          } else {
            // No data or error, set grounding type to no_data
            groundingType = 'no_data';
          }
        }
      } catch (error) {
        console.error('Error fetching BigQuery data:', error);
        groundingType = 'no_data';
      }
    }
    
    // Get the template output
    const store = {}; // Replace with actual store if available
    if (detection?.domain) {
      tmpl = await runTemplate(detection.domain, store);
    }
    
    // Build the grounding payload
    const grounding: GroundingPayload = {
      domain: detection?.domain ?? null,
      confidence: detection?.confidence ?? 0,
      groundingType: groundingType,
      kpiSummary: tmpl?.kpiSummary ?? null,
      templateOutput: tmpl?.templateOutput ?? null,
      bigQueryData: bigQueryData
    };
    
    // Update debug info if available
    if (typeof window !== 'undefined' && window.__riskillDebug) {
      window.__riskillDebug.routerDomain = detection?.domain ?? '';
      window.__riskillDebug.routerConfidence = detection?.confidence ?? 0;
      window.__riskillDebug.routerGroundingType = groundingType ? String(groundingType) : '';
    }
    
    return {
      message: userText,
      history,  // pass short rolling window (last 6 turns)
      grounding,
    };
  },
  
  /**
   * Send a chat message to the API and receive a response
   * @param params - The parameters for sending a chat
   * @param params.message - The message to send
   * @param params.chatHistory - The chat history
   * @param params.router - The router context with domain and confidence
   * @param params.template - The template ID
   * @returns The chat response with text and mode
   */
  async sendChat(params: {
    message: string;
    chatHistory?: Array<{type: string; text: string}>;
    router?: {domain: string; confidence: number};
    template?: string;
  }) {
    const { message, chatHistory, router, template } = params;
    
    if (!this.initialized) {
      const initResult = await this.init();
      if (!initResult.success) {
        console.error('Failed to initialize chat client:', initResult.message);
        window.__riskillDebug.lastError = 'Init failed: ' + initResult.message;
        return { mode: 'nodata', text: 'Service unavailable' };
      }
    }
    
    // Ensure we have a chat endpoint before continuing
    if (!this.endpoint) {
      console.error('No chat endpoint configured');
      window.__riskillDebug.lastError = 'No chat endpoint configured';
      return { mode: 'nodata', text: 'Service unavailable' };
    }
    
    const history = chatHistory?.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.text
    })) || [];
    
    // Update debug info with router domain and confidence
    if (router) {
      window.__riskillDebug.routerDomain = router.domain;
      window.__riskillDebug.routerConfidence = router.confidence;
      window.__riskillDebug.groundingType = 'router';
    }
    
    // Track request time for verification
    const requestTime = new Date().toISOString();
    window.__riskillDebug.lastRequestTime = requestTime;
    window.__riskillDebug.lastRequestEndpoint = this.endpoint;
    
    try {
      // Always send to serverless endpoint
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          history,
          router,
          template
        })
      });
      
      // Track response time for verification
      window.__riskillDebug.lastResponseTime = new Date().toISOString();
      window.__riskillDebug.lastResponseStatus = response.status;
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error from ${this.endpoint}:`, response.status, errorText);
        window.__riskillDebug.lastError = `${response.status}: ${errorText.substring(0, 100)}`;
        
        try {
          // Try to parse error as JSON
          const errorJson = JSON.parse(errorText);
          if (errorJson.mode === 'nodata') {
            return errorJson; // Return structured nodata response
          }
        } catch (e) {
          // Not JSON, continue to default error
        }
        
        return { mode: 'nodata', text: 'Service unavailable' };
      }
      
      const data = await response.json();
      
      // Handle structured response format
      if (data.mode === 'nodata') {
        return data;
      }
      
      // Update debug with metadata
      if (data.meta) {
        window.__riskillDebug.responseDomain = data.meta.domain;
        window.__riskillDebug.responseGroundingType = data.meta.groundingType;
        window.__riskillDebug.responseConfidence = data.meta.confidence;
      }
      
      return { 
        text: data.text || data.reply || 'No response from server',
        mode: data.mode || 'chat'
      };
        return { text: 'Received empty response from server', error: 'Empty response' };
      }
      
      try {
        return JSON.parse(text);
      } catch (e) {
        return { 
          text: 'Unable to parse server response', 
          error: `JSON parse error: ${e instanceof Error ? e.message : 'Unknown parsing error'}` 
        };
      }
    } catch (error) {
      console.error('[ChatClient] Chat API error:', error);
      return {
        text: 'Service unavailable. Please try again later.',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        meta: {
          domain: null,
          confidence: 0,
          groundingType: 'no_data'
        },
        mode: 'nodata',
        reason: 'network_error'
      };
    }
  },
  
  // Deprecated sendMessage method has been removed
  // Use sendChat instead
};
