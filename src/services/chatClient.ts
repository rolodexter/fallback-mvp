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

export const chatClient = {
  /**
   * Send a message to the chat API
   * @param message The user message
   * @param domain Optional domain context for the message
   * @returns Promise with the chat response
   */
  async sendMessage(message: string, domain?: string): Promise<ChatResponse> {
    // Determine if we're running on Netlify or Vercel
    const isNetlify = window.location.hostname.includes('netlify.app');
    
    // Choose the appropriate API endpoint
    const endpoint = isNetlify
      ? '/.netlify/functions/chat'
      : '/api/chat';
    
    try {
      const response = await fetch(endpoint, {
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
