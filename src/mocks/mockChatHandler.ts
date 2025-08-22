// Mock chat handler for development
import { http, HttpResponse, delay } from 'msw'
import { setupWorker } from 'msw/browser'

// Setup function to initialize mock handlers
export function setupMockHandlers() {
  if (typeof window === 'undefined') {
    return;
  }
  
  // Initialize MSW worker with handlers
  const worker = setupWorker(...mockChatHandler);
  
  // Start the worker
  worker.start({
    onUnhandledRequest: 'bypass' // Don't warn about unhandled requests
  }).catch(err => {
    console.error('MSW worker setup failed:', err);
  });
  
  console.log('🔶 Mock Service Worker initialized');
}

// Make sure to include both health and chat endpoints
export const mockChatHandler = [
  // Mock Vercel health endpoint
  http.get('/api/health', () => {
    return HttpResponse.json(
      {
        ok: true,
        env: 'vercel'
      },
      { status: 200 }
    )
  }),
  
  // Mock Netlify health endpoint
  http.get('/.netlify/functions/health', () => {
    return HttpResponse.json(
      {
        ok: true,
        env: 'netlify'
      },
      { status: 200 }
    )
  }),
  
  // Mock chat API for Vercel
  http.post('/api/chat', async ({ request }) => {
    try {
      // Add delay to simulate network latency
      await delay(500)
      
      // Parse the request body
      const body = await request.json() as { message: string; domain?: string }
      const { message, domain } = body
      
      // Generate more realistic responses based on the query and domain
      let reply = '';
      
      if (message.toLowerCase().includes('performance')) {
        reply = "The business units have shown varied performance this quarter. Technology sector is up by 8.2%, while Financial Services saw a slight decline of 1.7%. Would you like to see detailed metrics for a specific business unit?";
      } else if (message.toLowerCase().includes('trend')) {
        reply = "Monthly trends indicate a gradual increase in gross revenue since March. April and May showed the strongest performance, with June slightly below projections but still above previous year figures.";
      } else if (message.toLowerCase().includes('counterpart') || message.toLowerCase().includes('partner')) {
        reply = "Your top counterparties for this quarter are Acme Corp, TechGiant, and FinServices Ltd. Acme Corp represents 23% of your total transaction volume, showing a 5% increase from last quarter.";
      } else if (message.toLowerCase().includes('help')) {
        reply = "I can help you analyze business performance data, monthly revenue trends, and counterparty relationships. What specific information would you like to know about?";
      } else {
        reply = `I'm your financial data assistant. I can provide insights about the dashboard data, including business unit performance, monthly trends, and counterparty information. How can I help you analyze this information?`;
      }
      
      return HttpResponse.json(
        {
          reply,
          domain: domain || null
        },
        { status: 200 }
      )
    } catch (error) {
      return HttpResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }
  }),
  
  // Mock chat API for Netlify
  http.post('/.netlify/functions/chat', async ({ request }) => {
    try {
      // Add delay to simulate network latency
      await delay(500)
      
      // Parse the request body
      const body = await request.json() as { message: string; domain?: string }
      const { message, domain } = body
      
      // Generate more realistic responses based on the query and domain
      let reply = '';
      
      if (message.toLowerCase().includes('performance')) {
        reply = "The business units have shown varied performance this quarter. Technology sector is up by 8.2%, while Financial Services saw a slight decline of 1.7%. Would you like to see detailed metrics for a specific business unit?";
      } else if (message.toLowerCase().includes('trend')) {
        reply = "Monthly trends indicate a gradual increase in gross revenue since March. April and May showed the strongest performance, with June slightly below projections but still above previous year figures.";
      } else if (message.toLowerCase().includes('counterpart') || message.toLowerCase().includes('partner')) {
        reply = "Your top counterparties for this quarter are Acme Corp, TechGiant, and FinServices Ltd. Acme Corp represents 23% of your total transaction volume, showing a 5% increase from last quarter.";
      } else if (message.toLowerCase().includes('help')) {
        reply = "I can help you analyze business performance data, monthly revenue trends, and counterparty relationships. What specific information would you like to know about?";
      } else {
        reply = `I'm your financial data assistant. I can provide insights about the dashboard data, including business unit performance, monthly trends, and counterparty information. How can I help you analyze this information?`;
      }
      
      return HttpResponse.json(
        {
          reply,
          domain: domain || null
        },
        { status: 200 }
      )
    } catch (error) {
      return HttpResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }
  })
]

// End of mock handlers
