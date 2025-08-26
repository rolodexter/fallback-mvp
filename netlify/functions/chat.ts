import { Handler } from '@netlify/functions';
import { callLLMProvider } from '../../src/services/llmProvider';
import { GroundingPayload } from '../../src/services/chatClient';
import { routeMessage as domainRouteMessage } from '../../src/data/router/router';
import { routeMessage as topicRouteMessage } from '../../src/data/router/topicRouter';
import { runTemplate } from '../../src/data/templates';
import { rewriteMessage } from '../../src/services/semanticRewrite';

// Broad greeting/help detector used for server-side fallback
const GREET_RE = /\b(hi|hello|hey|yo|howdy|greetings|good\s+(morning|afternoon|evening)|help|start|get(ting)?\s+started|what\s+can\s+you\s+do)\b/i;

// Supported data modes
type DataMode = 'mock' | 'live';

// No dotenv in serverless functions; rely on platform env

// Helpers to detect list widgets robustly (supports `type` or `kind`)
function isListWidget(w: any): boolean {
  const t = String((w?.type ?? w?.kind ?? '')).toLowerCase();
  return t === 'list';
}
function isListOnly(widgets: unknown): boolean {
  if (!widgets) return false;
  const arr = Array.isArray(widgets) ? widgets : [widgets];
  if (arr.length === 0) return false;
  return arr.every(isListWidget);
}

// Helper: compute last 12 complete months [from, to] as YYYY-MM strings
function last12CompleteMonths(): { from: string; to: string } {
  const end = new Date();
  // Move to first day of current month, then step back 1 to get last complete month
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() - 1);
  const to = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 11);
  const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  return { from, to };
}

// Static BU chips for clarify (can be replaced with dynamic list later)
const STATIC_BU_CHIPS = [
  { id: 'ALL', label: 'All BUs' },
  { id: 'Z001', label: 'Z001 — Liferafts' },
  { id: 'Z002', label: 'Z002' },
  { id: 'Z003', label: 'Z003' },
];

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
  client_hints?: {
    prevDomain?: string | null;
    prevTemplate?: string | null;
    prevParams?: Record<string, any> | null;
    prevTop?: number | null;
    prevDetail?: number | null;
  };
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
    const clientHints = body.client_hints || {};
    
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

    // Server fallback for greetings/help -> safe BU list template (broadened)
    let fallbackGreetingApplied = false;
    if ((!det || !det.template_id) && GREET_RE.test((message || '').trim())) {
      det = { domain: 'business_units', template_id: 'business_units_list_v1', params: {} };
      fallbackGreetingApplied = true;
    }

    // Stateless follow-up folding using client hints when no deterministic route/template was found
    let usedClientHints = false;
    if ((!det || !det.template_id) && clientHints?.prevDomain && clientHints?.prevTemplate) {
      det = {
        domain: clientHints.prevDomain,
        template_id: clientHints.prevTemplate,
        params: { ...(clientHints.prevParams || {}) }
      };
      usedClientHints = true;
    }

    // Resolve the template key preference order: explicit templateId -> deterministic route -> domain
    let domainTemplate: string | undefined = (templateIdFromBody as string) || det.template_id || (routeResult.domain && routeResult.domain !== 'none' ? routeResult.domain : undefined);

    // Merge params in increasing precedence: hints -> deterministic -> body
    let params: Record<string, any> = { ...(clientHints?.prevParams || {}), ...(det.params || {}), ...(incomingParams || {}) };

    // Carry detail knob from hints if provided (client may bump on follow-ups)
    const detail: number | undefined = (typeof clientHints?.prevDetail === 'number') ? clientHints.prevDetail as number : undefined;

    // Slot-fill/Clarify: enforce period defaults and reuse/clarify unit for metric timeseries
    const isTimeseries = (typeof ((templateIdFromBody as string) || det.template_id) === 'string')
      ? (((templateIdFromBody as string) || det.template_id) === 'metric_timeseries_v1')
      : (domainTemplate === 'metric_timeseries_v1');
    if (isTimeseries) {
      // Period default: only when none provided
      if (!params.from && !params.to && !params.year && !params.time_window) {
        const { from, to } = last12CompleteMonths();
        params.from = from;
        params.to = to;
        if (!params.granularity) params.granularity = 'month';
        // Track defaults for transparency later in meta
        // defaults_used is declared below; accumulate here and will be spread into meta
      }

      // Unit handling: reuse previous if present; otherwise clarify
      if (!params.unit) {
        const prevUnit = clientHints?.prevParams?.unit as string | undefined;
        if (prevUnit) {
          params.unit = String(prevUnit).toUpperCase();
        } else {
          // Early clarify response; no red banner, 200 OK
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({
              mode: 'clarify',
              text: 'Which business unit should I use for the monthly gross trend?',
              clarify: {
                missing: ['unit'],
                suggestions: { unit: STATIC_BU_CHIPS }
              },
              meta: {
                domain: det.domain || (routeResult.domain || ''),
                confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
                groundingType: 'clarify',
                // Hint that we defaulted period silently
                defaults_used: (!params.from && !params.to) ? undefined : { period: 'last_12m' }
              },
              provenance: {
                tag: 'CLARIFY_REQUIRED',
                domain: det.domain,
                template: 'metric_timeseries_v1',
                state: { params }
              }
            })
          };
        }
      }
    }

    // Slot-fill safe defaults (example: latest complete year when template implies year granularity)
    const defaults_used: Record<string, any> = {};
    // If we filled timeseries from/to above, record it here for transparency
    if (params && params.from && params.to && !('period' in defaults_used)) {
      // Heuristic: if the caller didn't explicitly pass from/to in body or det, consider it a default
      // We cannot perfectly detect origin here; still useful for UX
      defaults_used.period = defaults_used.period || 'last_12m';
    }
    const now = new Date();
    const latestCompleteYear = now.getFullYear() - 1;
    if (params && typeof params.year === 'undefined' && typeof domainTemplate === 'string' && /_year_/.test(domainTemplate)) {
      params.year = latestCompleteYear;
      defaults_used.year = latestCompleteYear;
    }
    
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
    let kpisOut: any[] = [];
    let provenanceTag: string | undefined;
    
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
        // Normalize KPIs array from template output (if present)
        try {
          const tk = (templateOutput as any)?.kpis;
          kpisOut = Array.isArray(tk) ? tk : (tk ? [tk] : []);
        } catch {}

        // Decide if we should polish based on list-only gating and env flags
        const listOnly = isListOnly(widgets);
        const hasKpis = kpisOut.length > 0;
        const llmModeOn = process.env.NARRATIVE_MODE === 'llm';
        const polishEnvOn = String(process.env.POLISH_NARRATIVE ?? 'true').toLowerCase() !== 'false';
        let polishAllowed = llmModeOn && polishEnvOn && !!process.env.PERPLEXITY_API_KEY;
        if (listOnly && !hasKpis) polishAllowed = false;

        // Keep concise one-liner if list-only and no text
        if (!templateText && listOnly) {
          templateText = 'Here are the items you asked for.';
        }

        responseText = templateText;

        // Optionally polish the narrative if allowed
        if (polishAllowed && templateText) {
          try {
            const polishingPrompt = `Rewrite this text for clarity. Do not change numbers, KPIs, or fields. Here's the text:\n\n${templateText}`;
            const polishedText = await callLLMProvider(polishingPrompt, 'You are an editor helping to improve text clarity while preserving all facts and figures exactly as provided.', []);
            if (polishedText) {
              responseText = polishedText;
              provenanceTag = 'POLISH_APPLIED';
              console.log('Narrative polished successfully');
            }
          } catch (err) {
            console.warn('Failed to polish narrative, using template text directly:', err);
            responseText = templateText;
            provenanceTag = 'POLISH_SKIPPED_ERROR';
          }
        } else {
          provenanceTag = listOnly ? 'POLISH_SKIPPED_LIST_ONLY' : 'POLISH_SKIPPED_OFF';
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
        kpis: kpisOut,
        meta: {
          domain,
          confidence: routeResult.confidence,
          groundingType: (fallbackGreetingApplied ? 'fallback_greeting' : (usedClientHints ? 'followup' : groundingType)),
          ...(Object.keys(defaults_used).length ? { defaults_used } : {})
        },
        provenance: {
          template_id: domainTemplate,
          source: dataMode,
          platform: 'netlify',
          fn_dir: 'netlify/functions',
          tag: provenanceTag || (fallbackGreetingApplied ? 'SERVER_FALLBACK_GREETING' : undefined),
          domain: det?.domain,
          template: domainTemplate,
          state: { params, detail }
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
