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
  import('./services/chatClient').then(({ sendChat }) => {
    const platform = import.meta.env.VITE_DEPLOY_PLATFORM || 'vercel';
    const endpoint = platform === 'netlify' ? '/.netlify/functions/chat' : '/api/chat';

    (window as any).chatClient = {
      initialized: true,
      endpoint,
      // Keep signature compatible with smoke_test.js: sendChat(message, [])
      sendChat: (message: string, _attachments?: any[]) =>
        sendChat({ message, endpoint })
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
