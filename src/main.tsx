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
      onUnhandledRequest: 'bypass'
    }).catch((error) => {
      console.error('Failed to initialize MSW worker:', error);
    });
  }).catch(error => {
    console.error('Failed to import MSW worker:', error);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
