/**
 * Chat client service to handle API calls to both Netlify and Vercel endpoints
 * This service automatically selects the appropriate endpoint based on the current deployment platform
 */

type ChatMessage = {
  message: string;
  domain?: string;
};

type ChatResponse = {
  reply: string;
  domain?: string | null;
  error?: string;
};

// Debug info container for development purposes
declare global {
  interface Window {
    __riskillDebug: {
      endpoint: string;
      platform: string;
      routerDomain?: string;
      routerConfidence?: number;
      templateId?: string;
    };
  }
}

// Initialize debug container
if (typeof window !== 'undefined') {
  window.__riskillDebug = window.__riskillDebug || { endpoint: '', platform: '' };
}

export const chatClient = {
  endpoint: '',
  initialized: false,

  /**
   * Initialize the chat client by detecting the platform
   */
  async init() {
    if (this.initialized) return;
    
    // Try Vercel endpoint first
    try {
      const vercelResponse = await fetch('/api/health');
      if (vercelResponse.ok) {
        const data = await vercelResponse.json();
        if (data.ok) {
          this.endpoint = '/api/chat';
          if (typeof window !== 'undefined') {
            window.__riskillDebug.endpoint = this.endpoint;
            window.__riskillDebug.platform = 'vercel';
          }
          console.log('Using Vercel endpoint:', this.endpoint);
          this.initialized = true;
          return;
        }
      }
    } catch (error) {
      console.log('Vercel endpoint not available');
    }
    
    // Fall back to Netlify endpoint
    try {
      const netlifyResponse = await fetch('/.netlify/functions/health');
      if (netlifyResponse.ok) {
        const data = await netlifyResponse.json();
        if (data.ok) {
          this.endpoint = '/.netlify/functions/chat';
          if (typeof window !== 'undefined') {
            window.__riskillDebug.endpoint = this.endpoint;
            window.__riskillDebug.platform = 'netlify';
          }
          console.log('Using Netlify endpoint:', this.endpoint);
          this.initialized = true;
          return;
        }
      }
    } catch (error) {
      console.log('Netlify endpoint not available');
    }
    
    // Default fallback if both fail
    this.endpoint = '/api/chat';
    if (typeof window !== 'undefined') {
      window.__riskillDebug.endpoint = this.endpoint;
      window.__riskillDebug.platform = 'unknown';
    }
    console.warn('Could not detect platform, defaulting to:', this.endpoint);
    this.initialized = true;
  },

  /**
   * Send a message to the chat API
   * @param message The user message
   * @param domain Optional domain context for the message
   * @returns Promise with the chat response
   */
  async sendMessage(message: string, domain?: string): Promise<ChatResponse> {
    // Ensure client is initialized
    if (!this.initialized) {
      await this.init();
    }
    
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, domain } as ChatMessage)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Chat API error:', error);
      return {
        reply: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};
