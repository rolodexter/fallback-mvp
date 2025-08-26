import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Type declarations for Vite's environment variables are in vite-env.d.ts

// Setup mock service worker in development environment
if (import.meta.env.MODE === 'development') {
  import('./mocks/browser').then(({ worker }) => {
    console.log('Initializing mock service worker...');
    worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js'
      }
    }).then(() => {
      console.log('🟢 Mock Service Worker started successfully');
      // Make MSW status available globally for debugging
      window.__riskillDebug = window.__riskillDebug || {};
      window.__riskillDebug.mswActive = true;
    }).catch((error) => {
      console.error('Failed to initialize MSW worker:', error);
      window.__riskillDebug = window.__riskillDebug || {};
      window.__riskillDebug.mswActive = false;
      window.__riskillDebug.mswError = error?.message;
    });
  }).catch(error => {
    console.error('Failed to import MSW worker:', error);
  });

  // Dev-only chat client shim for browser smoke tests
  // Exposes window.chatClient with a simple sendChat(message) wrapper
  import('./services/chatClient').then(({ sendChat, chatClient }) => {
    const platform = import.meta.env.VITE_DEPLOY_PLATFORM || 'vercel';
    const endpoint = platform === 'netlify' ? '/.netlify/functions/chat' : '/api/chat';

    // Initialize the chatClient and assign to window
    window.chatClient = {
      initialized: true,
      endpoint,
      lastRequest: null,
      // Keep signature compatible with smoke_test.js: sendChat(message, [])
      sendChat: (message: string, _attachments?: any[]) =>
        sendChat({ message, endpoint }),
      // Initialize with our implementation
      init: chatClient.init.bind(chatClient),
      sendMessage: (message: string) => {
        if (window.handleUserChat) {
          window.handleUserChat(message);
        }
      },
      sendTemplate: (domain: string, template_id: string, params: Record<string, any> = {}) => {
        // Store the request for potential reuse (e.g., "Show all")
        window.chatClient!.lastRequest = { domain, template_id, params };
        
        // Format a message that includes template routing information
        if (window.handleUserChat) {
          const routerPayload = { domain, template_id, params };
          window.handleUserChat("", { router: routerPayload });
        }
      }
    };

    window.__riskillDebug = window.__riskillDebug || {};
    window.__riskillDebug.platform = platform;
    window.__riskillDebug.endpoint = endpoint;
  }).catch((e) => {
    console.warn('Dev chatClient shim failed to initialize:', e);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
