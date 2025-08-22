// src/mocks/browser.ts
import { setupWorker } from 'msw/browser'
import { mockChatHandler } from './mockChatHandler'

// This exports the worker instance
export const worker = setupWorker(...mockChatHandler)

// Only start MSW in development mode
if (import.meta.env.MODE === 'production') {
  console.log('MSW disabled in production');
} else {
  // Start the worker in development mode
  console.log('MSW starting in development mode');
}
