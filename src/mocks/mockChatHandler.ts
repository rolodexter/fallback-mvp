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
      
      // Parse the request body - Stage-A contract format
      const body = await request.json() as { 
        message: string; 
        router?: { domain: string }; 
        template?: { id: string };
        params?: Record<string, any>;
      }
      
      const { message, router, template } = body
      const domain = router?.domain || ''
      const templateId = template?.id || ''
      
      console.log('[MSW] Chat request:', { message, domain, templateId })
      
      // Generate responses based on canonical prompts
      let responseText = ''
      let kpis = null

      // CANONICAL PROMPT #1: Z001 June snapshot
      if (domain === 'business_units' && templateId === 'business_units_snapshot_yoy_v1') {
        responseText = "Business Unit Z001 showed strong performance in June 2025, with revenue reaching €3.2M, representing a +4.7% increase year-over-year. This growth outpaced overall business unit average growth of +2.1% for the same period. Key drivers included expansion in the industrial segment (+8.3%) and successful new product launches that contributed €0.5M in new revenue. Margin remained stable at 32.8% despite supply chain challenges in Q2."
        kpis = {
          revenue: "€3.2M",
          growth: "+4.7%",
          margin: "32.8%"
        }
      }
      // CANONICAL PROMPT #2: Top counterparties YTD
      else if (domain === 'counterparties' && templateId === 'top_counterparties_gross_v1') {
        responseText = "Your top counterparties YTD are: 1) ACME Corp (€2.1M, 18.1% of total, +5.2% YoY), 2) Globex Marine (€1.8M, 15.5% of total, +1.3% YoY), and 3) Oceanic Partners (€1.3M, 11.2% of total, -2.1% YoY). Together, these three partners represent 44.8% of your total transaction volume. ACME Corp has shown the strongest growth, primarily in Q2 with a significant order increase in May."
        kpis = {
          top1: "ACME Corp: €2.1M (18.1%)",
          top2: "Globex Marine: €1.8M (15.5%)",
          top3: "Oceanic Partners: €1.3M (11.2%)"
        }
      }
      // CANONICAL PROMPT #3: Monthly gross trend
      else if (domain === 'performance' && templateId === 'monthly_gross_trend_v1') {
        responseText = "Monthly gross revenue shows an upward trend over the past 6 months. March: €1.8M (+2.1% YoY), April: €2.3M (+4.5% YoY), May: €2.7M (+7.2% YoY), June: €2.5M (+3.1% YoY), July: €2.4M (+2.8% YoY), August: €2.6M (+5.3% YoY). The strongest performance was in May, driven by seasonal factors and a major contract win with ACME Corp. August shows renewed momentum after the slight dip in June-July."
        kpis = {
          trend: "+4.2% average YoY growth",
          peak: "May: €2.7M",
          latest: "August: €2.6M"
        }
      }
      // Default response for unmatched queries
      else {
        responseText = "I can provide insights about business unit performance, monthly trends, and counterparty information. Try asking about 'Z001 June snapshot', 'Top counterparties YTD', or 'Monthly gross trend'."
      }
      
      return HttpResponse.json(
        {
          text: responseText,
          kpis: kpis,
          meta: {
            domain: domain || null,
            confidence: 0.9,
            groundingType: 'strict'
          },
          mode: 'strict',
          provenance: {
            source: 'mock',
            timestamp: new Date().toISOString()
          }
        },
        { status: 200 }
      )
    } catch (error) {
      console.error('[MSW] Error processing chat request:', error)
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
      
      // Parse the request body - Stage-A contract format
      const body = await request.json() as { 
        message: string; 
        router?: { domain: string }; 
        template?: { id: string };
        params?: Record<string, any>;
      }
      
      const { message, router, template } = body
      const domain = router?.domain || ''
      const templateId = template?.id || ''
      
      console.log('[MSW] Chat request to Netlify:', { message, domain, templateId })
      
      // Generate responses based on canonical prompts
      let responseText = ''
      let kpis = null

      // CANONICAL PROMPT #1: Z001 June snapshot
      if (domain === 'business_units' && templateId === 'business_units_snapshot_yoy_v1') {
        responseText = "Business Unit Z001 showed strong performance in June 2025, with revenue reaching €3.2M, representing a +4.7% increase year-over-year. This growth outpaced overall business unit average growth of +2.1% for the same period. Key drivers included expansion in the industrial segment (+8.3%) and successful new product launches that contributed €0.5M in new revenue. Margin remained stable at 32.8% despite supply chain challenges in Q2."
        kpis = {
          revenue: "€3.2M",
          growth: "+4.7%",
          margin: "32.8%"
        }
      }
      // CANONICAL PROMPT #2: Top counterparties YTD
      else if (domain === 'counterparties' && templateId === 'top_counterparties_gross_v1') {
        responseText = "Your top counterparties YTD are: 1) ACME Corp (€2.1M, 18.1% of total, +5.2% YoY), 2) Globex Marine (€1.8M, 15.5% of total, +1.3% YoY), and 3) Oceanic Partners (€1.3M, 11.2% of total, -2.1% YoY). Together, these three partners represent 44.8% of your total transaction volume. ACME Corp has shown the strongest growth, primarily in Q2 with a significant order increase in May."
        kpis = {
          top1: "ACME Corp: €2.1M (18.1%)",
          top2: "Globex Marine: €1.8M (15.5%)",
          top3: "Oceanic Partners: €1.3M (11.2%)"
        }
      }
      // CANONICAL PROMPT #3: Monthly gross trend
      else if (domain === 'performance' && templateId === 'monthly_gross_trend_v1') {
        responseText = "Monthly gross revenue shows an upward trend over the past 6 months. March: €1.8M (+2.1% YoY), April: €2.3M (+4.5% YoY), May: €2.7M (+7.2% YoY), June: €2.5M (+3.1% YoY), July: €2.4M (+2.8% YoY), August: €2.6M (+5.3% YoY). The strongest performance was in May, driven by seasonal factors and a major contract win with ACME Corp. August shows renewed momentum after the slight dip in June-July."
        kpis = {
          trend: "+4.2% average YoY growth",
          peak: "May: €2.7M",
          latest: "August: €2.6M"
        }
      }
      // Default response for unmatched queries
      else {
        responseText = "I can provide insights about business unit performance, monthly trends, and counterparty information. Try asking about 'Z001 June snapshot', 'Top counterparties YTD', or 'Monthly gross trend'."
      }
      
      return HttpResponse.json(
        {
          text: responseText,
          kpis: kpis,
          meta: {
            domain: domain || null,
            confidence: 0.9,
            groundingType: 'strict'
          },
          mode: 'strict',
          provenance: {
            source: 'mock',
            timestamp: new Date().toISOString()
          }
        },
        { status: 200 }
      )
    } catch (error) {
      console.error('[MSW] Error processing chat request:', error)
      return HttpResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }
  })
]

// End of mock handlers
