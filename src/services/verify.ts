/**
 * Verification utilities for chat client configuration
 * Provides defensive checks to prevent rendering blank pages
 */

/**
 * Verify the chat client configuration and provide fallback values
 * to prevent blank rendering if environment variables are missing
 */
export function verifyChatClientConfig() {
  // Get deployment platform from build-time env or fallback
  const platform = import.meta.env.VITE_DEPLOY_PLATFORM || "vercel";
  
  // Determine the appropriate API endpoint based on platform
  const endpointHint = platform === "vercel"
    ? "/api/chat"
    : "/.netlify/functions/chat";

  // Return configuration that UI can use without throwing exceptions
  return { 
    platform, 
    endpointHint,
    
    // Add any other config values that might be missing at runtime
    dataMode: import.meta.env.VITE_DATA_MODE || "mock",
    
    // Debug info useful for troubleshooting
    debug: {
      hasViteEnv: typeof import.meta.env !== 'undefined',
      envKeys: Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')),
      timestamp: new Date().toISOString()
    }
  };
}
