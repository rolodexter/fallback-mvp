/**
 * ChatClient service for Stage-A contract
 */

// Stage-A: no router/detect imports here; payload is pre-routed by UI

// Request and response type definitions
export type ChatResponse = {
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
      mswActive?: boolean;
      mswError?: string;
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

};

// Minimal Stage-A types and sender
export type ChatPayload = {
  message: string;
  router?:   { domain?: string };
  template?: { id?: string };
  params?:   Record<string, any>;
  endpoint?: string;
};

export type Answer = {
  mode: "strict" | "abstain" | "nodata";
  text: string;
  kpis?: { label: string; value: string }[];
  provenance?: { source?: string; template_id?: string; snapshot?: string };
  coverage?: any;
  confidence?: "high" | "medium" | "low";
};

export async function sendChat(p: ChatPayload): Promise<Answer> {
  const endpoint = p.endpoint ||
    (import.meta.env.VITE_DEPLOY_PLATFORM === 'netlify' ? '/.netlify/functions/chat' : '/api/chat');
  const body = {
    message: p.message,
    router:   { domain: p.router?.domain },
    template: { id: p.template?.id },
    params:   p.params ?? {}
  };
  console.info('[SUBMIT]', { body, endpoint });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`chatClient: ${res.status}`);
  const ans = await res.json();
  console.info('[ANSWER]', ans);
  return ans as Answer;
}
