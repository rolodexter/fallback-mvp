// Mock chat handler for development
import { http, HttpResponse, delay } from 'msw'
import { setupWorker } from 'msw/browser'

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
      
      return HttpResponse.json(
        {
          reply: `Development mode response to: "${message}" ${domain ? `(domain: ${domain})` : ''}`,
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
      
      return HttpResponse.json(
        {
          reply: `Development mode response to: "${message}" ${domain ? `(domain: ${domain})` : ''}`,
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

export const setupMockHandlers = () => {
  if (typeof window !== 'undefined') {
    const worker = setupWorker(...mockChatHandler)
    worker.start({
      onUnhandledRequest: 'bypass', // Don't warn about unhandled requests
    })
    console.log('🔶 Mock API handlers enabled for development')
    return worker
  }
  return null
}
