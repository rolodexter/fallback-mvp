import type { VercelRequest, VercelResponse } from '@vercel/node';
 
 // Vercel Node runtime configuration
 export const config = { runtime: "nodejs" };

// Supported data modes
type DataMode = 'mock' | 'live';

// No dotenv in serverless functions; rely on platform env

// Normalize template hint from client (can be string or object with id)
type TemplateHint = string | { id?: string } | null | undefined;
const getTemplateId = (t: TemplateHint): string | undefined =>
  typeof t === 'string' ? t : (t && typeof t === 'object' ? t.id : undefined);

type ChatRequest = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  grounding?: {
    domain: string | null;
    confidence: number;
    groundingType: 'intro' | 'drilldown' | 'no_data' | null;
    kpiSummary?: string | null;
    templateOutput?: string | null;
    bigQueryData?: any[] | null;
  };
  router?: {
    domain: string;
    confidence?: number;
    [key: string]: any;
  };
  template?: string | { id?: string };
  params?: Record<string, any>;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  
  // Ensure it's a POST request
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }
  
  // Check which data mode we're in (mock or live); default to mock for Stage-A
  const dataMode: DataMode = ((process.env.DATA_MODE ?? 'mock') === 'live') ? 'live' : 'mock';
  console.log(`[Vercel] Using data mode: ${dataMode}`);
  
  // Only require LLM-related env vars when actually needed (live mode or narrative polishing)
  const requireLLM = (dataMode === 'live') || (process.env.POLISH_NARRATIVE === 'true');
  if (requireLLM) {
    const requiredEnvVars = ['PROVIDER', 'PERPLEXITY_API_KEY'];
    if (dataMode === 'live') {
      requiredEnvVars.push('GOOGLE_APPLICATION_CREDENTIALS');
    }
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingVars.length > 0) {
      console.error(`[ERROR] Missing required environment variables: ${missingVars.join(', ')}`);
      return response.status(503).json({ 
        mode: 'nodata',
        reason: 'missing_env',
        text: 'Service unavailable due to missing environment configuration.',
        details: `Missing environment variables: ${missingVars.join(', ')}` 
      });
    }
    // Validate provider value when used
    const provider = process.env.PROVIDER;
    if (provider !== 'perplexity') {
      console.error(`[ERROR] Unsupported provider: ${provider}`);
      return response.status(503).json({ 
        mode: 'nodata',
        reason: 'invalid_provider',
        text: 'Service unavailable due to provider configuration issues.',
        details: `Unsupported provider: ${provider}`
      });
    }
  }
  
  try {
    // Parse the request body safely
    const body = (request as any).body ?? {};
    const { message, history, grounding, router, template, params } = body as ChatRequest;
    // Normalize template id from hint
    const providedTemplateId = getTemplateId(template);
    // Lazy-load template registry to avoid module-init failures
    let templateRegistry: any;
    try {
      const mod = await import('../src/data/templates/template_registry');
      templateRegistry = mod.default;
    } catch (err) {
      return response.status(200).json({
        mode: 'abstain',
        text: 'Dependency unavailable',
        provenance: {
          source: dataMode,
          tag: 'IMPORT_REGISTRY_FAIL',
          error: err instanceof Error ? err.message : String(err)
        }
      });
    }
    // If client supplied a template id that is not present in registry, short-circuit in Stage-A
    if (providedTemplateId) {
      const registryTemplateIds = Object.values(templateRegistry)
        .map((v: any) => v?.templateId)
        .filter((x: any): x is string => typeof x === 'string');
      if (!registryTemplateIds.includes(providedTemplateId)) {
        return response.status(200).json({
          mode: 'nodata',
          text: 'No mock template available for this id.',
          provenance: {
            source: dataMode,
            reason: 'missing_template',
            template_id: providedTemplateId
          }
        });
      }
    }

    if (!message || typeof message !== 'string') {
      return response.status(200).json({ 
        mode: 'nodata', 
        reason: 'missing_message',
        text: 'No message provided.'
      });
    }
    
    // Determine routing; if client router lacks confidence, compute on server
    // Lazy-load router to avoid module-init failures
    let routeMessageFn: any;
    try {
      const mod = await import('../src/data/router/router');
      routeMessageFn = mod.routeMessage;
      if (typeof routeMessageFn !== 'function') throw new Error('routeMessage not found');
    } catch (err) {
      return response.status(200).json({
        mode: 'abstain',
        text: 'Dependency unavailable',
        provenance: {
          source: dataMode,
          tag: 'IMPORT_ROUTER_FAIL',
          error: err instanceof Error ? err.message : String(err)
        }
      });
    }
    const serverRoute = routeMessageFn(message);
    let routeResult = router && typeof router.domain === 'string'
      ? { domain: router.domain, confidence: typeof router.confidence === 'number' ? router.confidence : serverRoute.confidence }
      : serverRoute;

    // For Stage-A we use domain (not template id) to run templates; keep template id only for provenance
    const domainToUse = routeResult.domain !== 'none' ? routeResult.domain : undefined;
    
    // Safety check - if router returns 'none' domain, return nodata response immediately
    if (!domainToUse || routeResult.confidence < 0.3) {
      console.info('[Vercel] No domain detected or low confidence, returning nodata response');
      return response.status(200).json({
        mode: 'nodata',
        reason: 'no_domain',
        text: 'Try asking about Business Units (YoY), Top Counterparties, or Monthly Gross Trend.',
        meta: {
          domain: null,
          confidence: routeResult.confidence || 0,
          groundingType: null
        }
      });
    }
    
    // Generate grounding data if not provided in request
    let groundingData = grounding;
    
    if (!groundingData && domainToUse && routeResult.confidence >= 0.3) {
      try {
        console.info(`[Vercel] Generating grounding data for domain: ${domainToUse}`);
        // Lazy-load templates module
        let runTemplateFn: any;
        try {
          const mod = await import('../src/data/templates');
          runTemplateFn = mod.runTemplate;
          if (typeof runTemplateFn !== 'function') throw new Error('runTemplate not found');
        } catch (err) {
          return response.status(200).json({
            mode: 'abstain',
            text: 'Dependency unavailable',
            provenance: {
              source: dataMode,
              tag: 'IMPORT_TEMPLATES_FAIL',
              error: err instanceof Error ? err.message : String(err)
            }
          });
        }
        const templateData = await runTemplateFn(domainToUse, null);
        
        groundingData = {
          domain: domainToUse,
          confidence: routeResult.confidence,
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput || null,
          groundingType: 'drilldown',  // Using supported type from the enum
          bigQueryData: null
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we're in live mode and don't have BigQuery data yet, try template
    if (dataMode === 'live' && !groundingData && domainToUse && routeResult.confidence >= 0.3) {
      try {
        console.info(`[Vercel] Generating grounding data for domain: ${domainToUse}`);
        // Lazy-load templates module
        let runTemplateFn: any;
        try {
          const mod = await import('../src/data/templates');
          runTemplateFn = mod.runTemplate;
          if (typeof runTemplateFn !== 'function') throw new Error('runTemplate not found');
        } catch (err) {
          return response.status(200).json({
            mode: 'abstain',
            text: 'Dependency unavailable',
            provenance: {
              source: dataMode,
              tag: 'IMPORT_TEMPLATES_FAIL',
              error: err instanceof Error ? err.message : String(err)
            }
          });
        }
        const templateData = await runTemplateFn(domainToUse, null);
        
        groundingData = {
          domain: domainToUse,
          confidence: routeResult.confidence,
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput || null,
          groundingType: 'drilldown',
          bigQueryData: null
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we still don't have grounding data, return abstain response
    if (!groundingData) {
      return response.status(200).json({
        mode: 'abstain',
        text: 'I don\'t have the data you\'re looking for right now.',
        abstain_reason: 'no_grounding_data',
        meta: {
          domain: domainToUse,
          confidence: routeResult.confidence,
          groundingType: 'none'
        },
        provenance: {
          source: dataMode,
          template_id: providedTemplateId || domainToUse,
          params: params || {}
        }
      });
    }
    
    // Extract domain and BigQuery data from grounding
    const domain = groundingData.domain;
    const bigQueryData = groundingData.bigQueryData || null;
    const templateOutput = groundingData.templateOutput || null;
    const kpiSummary = groundingData.kpiSummary || null;
    const groundingType = groundingData.groundingType;
    
    console.log(`Using domain: ${domain}, Grounding type: ${groundingType}`);
    
    let systemPrompt = '';
    let responseText = '';
    let widgets = null;
    
    // For template/mock data mode, we can use the template output directly
    if (templateOutput) {
      // In mock mode or when using templates directly, we can use the template output directly
      if (dataMode === 'mock') {
        // Stage-A: never call LLM/polish when in mock mode
        responseText = templateOutput;
      } else {
        // In live mode, use the template output to guide the LLM
        systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data and text provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.

KPI SUMMARY:\n${kpiSummary || 'No KPI summary available.'}

TEMPLATE OUTPUT:\n${templateOutput}`;
        
        // Lazy-load LLM provider
        let callLLMProvider: any;
        try {
          ({ callLLMProvider } = await import('../src/services/llmProvider'));
        } catch (err) {
          return response.status(200).json({
            mode: 'abstain',
            text: 'Dependency unavailable',
            provenance: {
              source: dataMode,
              tag: 'IMPORT_LLM_FAIL',
              error: err instanceof Error ? err.message : String(err)
            }
          });
        }
        // Call LLM provider
        responseText = await callLLMProvider(message, systemPrompt, history, null, domain);
      }
    } else if (bigQueryData) {
      // Format BigQuery results
      const resultsText = JSON.stringify(bigQueryData, null, 2);
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.

BIGQUERY DATA:\n${resultsText}`;
      
      // Lazy-load LLM provider
      let callLLMProvider: any;
      try {
        ({ callLLMProvider } = await import('../src/services/llmProvider'));
      } catch (err) {
        return response.status(200).json({
          mode: 'abstain',
          text: 'Dependency unavailable',
          provenance: {
            source: dataMode,
            tag: 'IMPORT_LLM_FAIL',
            error: err instanceof Error ? err.message : String(err)
          }
        });
      }
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, [], bigQueryData, domain);
    } else {
      // No grounding available
      if (dataMode === 'mock') {
        // Stage-A: do not call LLM, return abstain deterministically
        return response.status(200).json({
          mode: 'abstain',
          text: "I don't have the data you're looking for right now.",
          abstain_reason: 'no_grounding_data',
          meta: {
            domain: domainToUse,
            confidence: routeResult.confidence,
            groundingType: 'none'
          },
          provenance: {
            source: dataMode,
            template_id: providedTemplateId || domainToUse,
            params: params || {}
          }
        });
      } else {
        // Live mode: allow generic LLM call
        systemPrompt = `You are Riskill, a financial data analysis assistant. Answer questions about financial KPIs and business metrics. If you don't know the answer, say "I don't have that information available." DO NOT make up data.`;
        // Lazy-load LLM provider
        let callLLMProvider: any;
        try {
          ({ callLLMProvider } = await import('../src/services/llmProvider'));
        } catch (err) {
          return response.status(200).json({
            mode: 'abstain',
            text: 'Dependency unavailable',
            provenance: {
              source: dataMode,
              tag: 'IMPORT_LLM_FAIL',
              error: err instanceof Error ? err.message : String(err)
            }
          });
        }
        responseText = await callLLMProvider(message, systemPrompt, [], null, null);
      }
    }
    
    // Extract widgets from template data if available
    if (groundingData && groundingData.kpiSummary) {
      try {
        const kpiData = JSON.parse(groundingData.kpiSummary);
        if (kpiData && typeof kpiData === 'object') {
          widgets = kpiData;
        }
      } catch (e) {
        console.warn('Failed to parse KPI data as JSON:', e);
      }
    }

    // Prepare response
    return response.status(200).json({
      text: responseText,
      mode: 'strict',  // Default to strict mode for mock/template data
      widgets: widgets,
      meta: {
        domain,
        confidence: routeResult.confidence,
        groundingType
      },
      provenance: {
        template_id: providedTemplateId || domainToUse,
        source: dataMode,
        params: params || {}
      }
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    if (error instanceof Error) {
      console.error(error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error(`Development error: ${error.message}`);
      }
    }
    // Telemetry: log stack for rapid diagnosis
    if (error && typeof (error as any).stack === 'string') {
      console.error('[CHAT_RUNTIME]', (error as any).stack);
    } else {
      console.error('[CHAT_RUNTIME] no-stack');
    }
    // Fail-safe: never 500 in Stage-A; return deterministic abstain
    return response.status(200).json({
      mode: 'abstain',
      text: 'Runtime guard activated. See Functions logs for details.',
      provenance: {
        source: (typeof dataMode !== 'undefined' ? dataMode : 'mock'),
        tag: 'CHAT_RUNTIME',
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}
