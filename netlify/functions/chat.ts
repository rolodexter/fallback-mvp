import { Handler } from '@netlify/functions';
import { callLLMProvider } from '../../src/services/llmProvider';
import { GroundingPayload } from '../../src/services/chatClient';
import { routeMessage as domainRouteMessage } from '../../src/data/router/router';
import { routeMessage as topicRouteMessage } from '../../src/data/router/topicRouter';
import { runTemplate } from '../../src/data/templates';
import { rewriteMessage } from '../../src/services/semanticRewrite';

// Supported data modes
type DataMode = 'mock' | 'live';

// No dotenv in serverless functions; rely on platform env

type ChatRequest = {
  message: string;
  history: Array<{role: "user" | "assistant", content: string}>;
  grounding?: GroundingPayload;
  router?: {
    domain?: string;
    confidence?: number;
    [key: string]: any;
  };
  template?: string | { id?: string };
  params?: Record<string, any>;
};

/**
 * Netlify serverless function for chat API
 * Handles grounded chat message requests and forwards them to the LLM provider
 */
const handler: Handler = async (event) => {
  console.log('Netlify function called:', event.httpMethod, event.path);
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: ''
    };
  }
  
  // Check which data mode we're in (mock or live). Default to mock for Stage-A.
  const dataMode: DataMode = (String(process.env.DATA_MODE || 'mock') === 'mock' ? 'mock' : 'live');
  const polishing = String(process.env.POLISH_NARRATIVE || 'false').toLowerCase() === 'true';
  console.log(`[Netlify] Using data mode: ${dataMode} | polishing=${polishing}`);
  
  // Check for required environment variables (relaxed in mock unless polishing)
  const requiredEnvVars: string[] = [];
  if (dataMode === 'live' || polishing) {
    requiredEnvVars.push('PROVIDER', 'PERPLEXITY_API_KEY');
  }
  if (dataMode === 'live') {
    requiredEnvVars.push('GOOGLE_APPLICATION_CREDENTIALS');
  }
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    console.error(`[ERROR] Missing required environment variables: ${missingVars.join(', ')}`);
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({ 
        mode: 'nodata',
        reason: 'missing_env',
        text: 'Service unavailable due to missing environment configuration.',
        details: `Missing environment variables: ${missingVars.join(', ')}`,
        provenance: {
          platform: 'netlify',
          fn_dir: 'netlify/functions'
        }
      })
    };
  }

  // Validate provider only when required
  const provider = process.env.PROVIDER;
  if ((dataMode === 'live' || polishing) && provider !== 'perplexity') {
    console.error(`[ERROR] Unsupported provider: ${provider}`);
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({ 
        mode: 'nodata',
        reason: 'invalid_provider',
        text: 'Service unavailable due to provider configuration issues.',
        details: `Unsupported provider: ${provider}`,
        provenance: {
          platform: 'netlify',
          fn_dir: 'netlify/functions'
        }
      })
    };
  }

  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const body = JSON.parse(event.body || '{}') as ChatRequest;
    const { message, history, grounding } = body;
    const incomingRouter = body.router || {};
    const incomingParams = body.params || {};
    const templateIdFromBody = typeof body.template === 'string' ? body.template : (body.template && (body.template as any).id);
    
    if (!message) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body: JSON.stringify({ 
          mode: 'nodata', 
          reason: 'missing_message',
          text: 'Invalid request. Message is required.'
        })
      };
    }
    
    // Semantic rewrite to canonicalize free-form (e.g., aliases -> Z001 June snapshot)
    let canonicalMsg: string | undefined;
    try {
      const rw = await rewriteMessage(message);
      canonicalMsg = rw?.canonical;
      if (canonicalMsg) console.info('[rewrite]', { canonical: canonicalMsg, confidence: rw?.confidence });
    } catch (e) {
      console.warn('[rewrite] failed', e);
    }

    // Use incoming router context if provided, otherwise perform routing on the server
    let routeResult = incomingRouter && (incomingRouter.domain || incomingRouter.confidence)
      ? incomingRouter as { domain?: string; confidence?: number }
      : (domainRouteMessage(message) as { domain?: string; confidence?: number });

    // Deterministic topic routing from canonical or original message (maps to template_id + params)
    let det = topicRouteMessage(canonicalMsg || message) as { domain?: string; template_id?: string; params?: Record<string, any> };

    // Server fallback for greetings/help -> safe BU list template
    const GREET_RE = /^(hi|hello|hey|howdy|hiya|yo|good\s+(morning|afternoon|evening)|help|start|get started|what can you do)\b/i;
    let fallbackGreetingApplied = false;
    if ((!det || !det.template_id) && GREET_RE.test(message)) {
      det = { domain: 'business_units', template_id: 'business_units_list_v1', params: {} };
      fallbackGreetingApplied = true;
    }

    // Resolve the template key preference order: explicit templateId -> deterministic route -> domain
    let domainTemplate: string | undefined = (templateIdFromBody as string) || det.template_id || (routeResult.domain && routeResult.domain !== 'none' ? routeResult.domain : undefined);

    // Merge params from deterministic route and incoming body
    let params: Record<string, any> = { ...(det.params || {}), ...(incomingParams || {}) };
    
    // Safety check - return nodata only if no deterministic/explicit template resolved
    if (!domainTemplate && ((routeResult.domain === 'none') || (typeof routeResult.confidence === 'number' && routeResult.confidence < 0.3))) {
      console.info('[Netlify] No domain detected or low confidence, returning nodata response');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body: JSON.stringify({
          mode: 'nodata',
          reason: 'no_domain',
          text: 'Try asking about Business Units (YoY), Top Counterparties, or Monthly Gross Trend.',
          meta: {
            domain: null,
            confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0),
            groundingType: null
          },
          provenance: {
            platform: 'netlify',
            fn_dir: 'netlify/functions'
          }
        })
      };
    }

    // Generate grounding data if not provided in request
    let groundingData = grounding;
    
    if (!groundingData && domainTemplate && (typeof routeResult.confidence !== 'number' || routeResult.confidence >= 0.3)) {
      try {
        console.info(`[Netlify] Generating grounding data for: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, params ?? null);
        
        groundingData = {
          domain: det.domain || (routeResult.domain || ''),
          confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput || null,
          groundingType: 'template'
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we're in mock mode or don't have BigQuery data yet, try template
    if ((dataMode === 'mock' || dataMode === 'live') && !groundingData && domainTemplate && (typeof routeResult.confidence !== 'number' || routeResult.confidence >= 0.3)) {
      try {
        console.info(`[Netlify] Generating grounding data (fallback) for: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, params ?? null);
        
        groundingData = {
          domain: det.domain || (routeResult.domain || ''),
          confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
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
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body: JSON.stringify({
          mode: 'abstain',
          text: 'I don\'t have the data you\'re looking for right now.',
          abstain_reason: 'no_grounding_data',
          meta: {
            domain: domainTemplate,
            confidence: routeResult.confidence,
            groundingType: 'none'
          },
          provenance: {
            source: dataMode,
            template_id: domainTemplate,
            platform: 'netlify',
            fn_dir: 'netlify/functions'
          }
        })
      };
    }
    
    // Extract domain and template information from grounding
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
      // Normalize template output to string and carry widgets through
      let templateText = typeof templateOutput === 'string'
        ? templateOutput
        : (templateOutput && typeof templateOutput === 'object'
            ? (templateOutput as any).text
            : '');
      if ((!templateText || typeof templateText !== 'string') && templateOutput) {
        try { templateText = JSON.stringify(templateOutput); } catch { templateText = String(templateOutput); }
      }
      try {
        const tw = (templateOutput as any)?.widgets;
        if (tw && !widgets) { widgets = tw; }
      } catch {}

      // In mock mode or when using templates directly, we can use the template output directly
      if (dataMode === 'mock') {
        responseText = templateText;
        
        // Optionally polish the narrative if needed
        if (process.env.POLISH_NARRATIVE === 'true' && templateText) {
          try {
            const polishingPrompt = `Rewrite this text for clarity. Do not change numbers, KPIs, or fields. Here's the text:\n\n${templateText}`;
            const polishedText = await callLLMProvider(polishingPrompt, 'You are an editor helping to improve text clarity while preserving all facts and figures exactly as provided.', []);
            
            if (polishedText) {
              responseText = polishedText;
              console.log('Narrative polished successfully');
            }
          } catch (err) {
            console.warn('Failed to polish narrative, using template text directly:', err);
            // Fall back to template text
            responseText = templateText;
          }
        }
      } else {
        // In live mode, use the template output to guide the LLM
        systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data and text provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.\n
KPI SUMMARY:\n${kpiSummary || 'No KPI summary available.'}\n
TEMPLATE OUTPUT:\n${templateText}`;
        
        // Call LLM provider
        responseText = await callLLMProvider(message, systemPrompt, history || []);
      }
    } else if (bigQueryData) {
      // Format BigQuery results
      const resultsText = JSON.stringify(bigQueryData, null, 2);
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.\n
BIGQUERY DATA:\n${resultsText}`;
      
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, history || []);
    } else {
      // Generic prompt when no grounding
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer questions about financial KPIs and business metrics. If you don't know the answer, say "I don't have that information available." DO NOT make up data.`;
      
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, history || []);
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
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({
        text: responseText,
        mode: 'strict',  // Default to strict mode for mock/template data
        widgets: widgets,
        meta: {
          domain,
          confidence: routeResult.confidence,
          groundingType: (fallbackGreetingApplied ? 'fallback_greeting' : groundingType)
        },
        provenance: {
          template_id: domainTemplate,
          source: dataMode,
          platform: 'netlify',
          fn_dir: 'netlify/functions'
        }
      })
    };
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Return structured error response with nodata mode
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({ 
        mode: 'nodata',
        reason: 'server_error',
        text: 'Service unavailable. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error',
        provenance: {
          platform: 'netlify',
          fn_dir: 'netlify/functions'
        }
      })
    };
  }
};

export { handler };
