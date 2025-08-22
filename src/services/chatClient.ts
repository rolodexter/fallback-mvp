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
          'risk': 'risks_summary'
        };
        
        const templateId = templateMap[detection.domain];
        
        if (templateId) {
          // Execute BigQuery query based on domain
          let params = {};
          
          // Set parameters based on user query
          if (templateId === 'customers_top_n') {
            params = { limit: 5 };
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
   * Send a chat message with grounding information
   * @param userText The user message
   * @param history Array of previous messages in the conversation
   * @returns Promise with the chat response
   */
  async sendChat(userText: string, history: Array<{role: "user" | "assistant", content: string}> = []): Promise<ChatResponse> {
    // Ensure client is initialized
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // Build the grounded request
      const body = await this.buildGroundedRequest(userText, history);
      
      // Send the request to the API
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        try {
          // Try to parse error response as JSON
          const text = await response.text();
          let errorMessage = `Error: ${response.status} ${response.statusText}`;
          
          if (text && text.trim() !== '') {
            try {
              const errorData = JSON.parse(text);
              if (errorData.error) errorMessage = errorData.error;
            } catch (e) {
              // If JSON parsing fails, use the text as error message
              errorMessage = text;
            }
          }
          throw new Error(errorMessage);
        } catch (e) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
      }
      
      // Safely parse response
      const text = await response.text();
      if (!text || text.trim() === '') {
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
      console.error('Chat API error:', error);
      return {
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use sendChat instead
   */
  async sendMessage(message: string, _domain?: string): Promise<ChatResponse> {
    console.warn('sendMessage is deprecated, use sendChat instead');
    return this.sendChat(message, []);
  }
};
