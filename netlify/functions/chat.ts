import { Handler } from '@netlify/functions';
import { callLLMProvider, LLMStage } from '../../src/services/llmProvider.js';
import { GroundingPayload } from '../../src/services/chatClient.js';
import { routeMessage as domainRouteMessage } from '../../src/data/router/router.js';
import { routeMessage as topicRouteMessage } from '../../src/data/router/topicRouter.js';
import { runTemplate } from '../../src/data/templates.js';
import { rewriteMessage } from '../../src/services/semanticRewrite.js';
import { enrichBusinessUnitData, synthesizeBuImportanceResponse } from '../../src/services/buEnrichment.js';
import { unitLabel } from '../../src/data/labels.js';
import { getDataMode, allowMockFallback } from '../../src/lib/dataMode.js';
import { makeBQ } from '../../src/lib/bq.js';

// Broad greeting/help detector used for server-side fallback
const GREET_RE = /\b(hi|hello|hey|yo|howdy|greetings|good\s+(morning|afternoon|evening)|help|start|get(ting)?\s+started|what\s+can\s+you\s+do)\b/i;

// Using DataMode from dataMode.ts import

/**
 * Generate a response using multi-step prompting approach with Perplexity
 * @param message User message
 * @param systemPrompt System prompt for context
 * @param data BigQuery data or template output for grounding
 * @param history Optional conversation history
 * @param domain Optional domain context
 * @returns Generated response text
 */
async function generateMultiStepResponse(
  message: string,
  systemPrompt: string,
  data: any[] | any | null,
  history: Array<{role: "user" | "assistant", content: string}> = [],
  domain?: string | null,
  stageOverride?: LLMStage
): Promise<string> {
  // Generate a unique ID for this multi-step response process for tracing
  const multiStepId = `ms-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`[MultiStep:${multiStepId}] Starting multi-step response generation`);  
  console.log(`[MultiStep:${multiStepId}] Message length: ${message.length}, system prompt length: ${systemPrompt.length}`);
  console.log(`[MultiStep:${multiStepId}] History entries: ${history.length}, domain: ${domain || 'none'}`);
  
  // Log data type and size for debugging
  if (data === null) {
    console.log(`[MultiStep:${multiStepId}] Data: null`);
  } else if (Array.isArray(data)) {
    console.log(`[MultiStep:${multiStepId}] Data: Array with ${data.length} items`);
  } else if (typeof data === 'object') {
    console.log(`[MultiStep:${multiStepId}] Data: Object with ${Object.keys(data).length} keys`);
  } else {
    console.log(`[MultiStep:${multiStepId}] Data: ${typeof data}`);
  }
  try {
    // STEP 1: Generate skeleton with placeholders
    console.log(`[MultiStep:${multiStepId}] Step 1: Generating skeleton with placeholders`);
    const skeletonStage = stageOverride || 'skeleton';
    const skeleton = await callLLMProvider(message, systemPrompt, history, data, domain, skeletonStage);
    console.log(`[MultiStep:${multiStepId}] Skeleton generated:`, { skeletonLength: skeleton.length });
    
    // Debug output - first 100 chars of skeleton for validation
    console.log(`[MultiStep:${multiStepId}] Skeleton preview: ${skeleton.substring(0, 100)}...`);
    
    // STEP 2: Fill placeholders with factual data
    console.log(`[MultiStep:${multiStepId}] Step 2: Filling placeholders with data`);
    const placeholders = extractPlaceholders(skeleton);
    console.log(`[MultiStep:${multiStepId}] Extracted ${placeholders.length} placeholders:`, placeholders);
    const filledResponse = fillPlaceholders(skeleton, placeholders, data);
    console.log(`[MultiStep:${multiStepId}] Placeholders filled successfully`);
    
    // Debug output - first 100 chars of filled response
    console.log(`[MultiStep:${multiStepId}] Filled response preview: ${filledResponse.substring(0, 100)}...`);
    
    // STEP 3: Polish the response with reasoning
    console.log(`[MultiStep:${multiStepId}] Step 3: Reasoning about data relationships`);
    const reasoningPrompt = `Analyze this data-grounded response and identify key business insights: ${filledResponse.substring(0, 3000)}`; // Limit input size
    console.log(`[MultiStep:${multiStepId}] Reasoning prompt length: ${reasoningPrompt.length}`);
    
    const reasonedResponse = await callLLMProvider(
      reasoningPrompt,
      systemPrompt,
      history, 
      data, 
      domain, 
      'reasoning'
    );
    console.log(`[MultiStep:${multiStepId}] Reasoning response generated, length: ${reasonedResponse.length}`);
    
    // STEP 4: Final polish for executive presentation
    console.log(`[MultiStep:${multiStepId}] Step 4: Final polish for executive presentation`);
    const polishPrompt = `Polish this business analysis for executive clarity: ${reasonedResponse.substring(0, 3000)}`; // Limit input size
    console.log(`[MultiStep:${multiStepId}] Polish prompt length: ${polishPrompt.length}`);
    
    const polishedResponse = await callLLMProvider(
      polishPrompt,
      systemPrompt,
      history,
      data,
      domain,
      'polish'
    );
    console.log(`[MultiStep:${multiStepId}] Polish complete, final response length: ${polishedResponse.length}`);
    console.log(`[MultiStep:${multiStepId}] Final response preview: ${polishedResponse.substring(0, 100)}...`);
    
    return polishedResponse;
  } catch (error) {
    console.error(`[MultiStep:${multiStepId}] Error in multi-step prompting:`, error);
    
    // Graceful fallback to single-step if any part of multi-step fails
    console.log(`[MultiStep:${multiStepId}] Falling back to single-step response`);
    const fallbackResponse = await callLLMProvider(message, systemPrompt, history, data, domain, 'reasoning');
    console.log(`[MultiStep:${multiStepId}] Fallback response generated, length: ${fallbackResponse.length}`);
    return fallbackResponse;
  }
}

/**
 * Extract placeholder markers from text
 * @param text Text with placeholders in {{PLACEHOLDER}} format
 * @returns Array of placeholder names
 */
function extractPlaceholders(text: string): string[] {
  const placeholderRegex = /{{([A-Z_]+)}}/g;
  const placeholders: string[] = [];
  let match;
  
  while ((match = placeholderRegex.exec(text)) !== null) {
    placeholders.push(match[1]);
  }
  
  return [...new Set(placeholders)]; // Remove duplicates
}

/**
 * Fill placeholders with data from BigQuery results or template output
 * @param text Text with placeholders to fill
 * @param placeholders Array of placeholder names to replace
 * @param data BigQuery data or template output
 * @returns Text with placeholders filled with actual data
 */
function fillPlaceholders(text: string, placeholders: string[], data: any[] | any): string {
  if (!data) return text;
  
  let filledText = text;
  
  // Handle array data (BigQuery results)
  if (Array.isArray(data)) {
    // For each placeholder, try to find a matching field in the data
    placeholders.forEach(placeholder => {
      const placeholderLower = placeholder.toLowerCase();
      
      // Look for an exact match in the first data row's keys
      if (data.length > 0) {
        const firstRow = data[0];
        const matchingKey = Object.keys(firstRow).find(key => 
          key.toLowerCase().includes(placeholderLower) || 
          placeholderLower.includes(key.toLowerCase())
        );
        
        if (matchingKey && firstRow[matchingKey] !== undefined) {
          const value = formatPlaceholderValue(firstRow[matchingKey], placeholderLower);
          filledText = filledText.replace(new RegExp(`{{${placeholder}}}`, 'g'), value);
        }
      }
    });
  } 
  // Handle object data (template output)
  else if (typeof data === 'object') {
    placeholders.forEach(placeholder => {
      const placeholderLower = placeholder.toLowerCase();
      
      // Try to find keys that match the placeholder
      const matchingKey = Object.keys(data).find(key => 
        key.toLowerCase().includes(placeholderLower) || 
        placeholderLower.includes(key.toLowerCase())
      );
      
      if (matchingKey && data[matchingKey] !== undefined) {
        const value = formatPlaceholderValue(data[matchingKey], placeholderLower);
        filledText = filledText.replace(new RegExp(`{{${placeholder}}}`, 'g'), value);
      }
    });
  }
  
  // Replace any unfilled placeholders with a marker
  filledText = filledText.replace(/{{[A-Z_]+}}/g, '[data unavailable]');
  
  return filledText;
}

/**
 * Format placeholder value based on type and context
 * @param value The raw value from data
 * @param context The placeholder context
 * @returns Formatted value as string
 */
function formatPlaceholderValue(value: any, context: string): string {
  if (value === null || value === undefined) return '[data unavailable]';
  
  // Handle numeric values
  if (typeof value === 'number') {
    // Currency formatting for monetary values
    if (context.includes('revenue') || 
        context.includes('cost') || 
        context.includes('profit') || 
        context.includes('sales') ||
        context.includes('budget')) {
      // Format as currency with M/B suffix for large values
      if (value >= 1000000000) {
        return `€${(value / 1000000000).toFixed(1)}B`;
      } else if (value >= 1000000) {
        return `€${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `€${(value / 1000).toFixed(1)}K`;
      } else {
        return `€${value.toFixed(2)}`;
      }
    }
    
    // Percentage formatting
    else if (context.includes('rate') || 
             context.includes('percent') || 
             context.includes('margin') || 
             context.includes('growth')) {
      return `${value.toFixed(1)}%`;
    }
    
    // Default number formatting
    else if (value === Math.floor(value)) {
      return value.toString();
    } else {
      return value.toFixed(1);
    }
  }
  
  // Handle date values
  else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  
  // Default string handling
  return String(value);
}

// Extended template result with additional metadata fields
interface ExtendedTemplateResult {
  kpiSummary: any;
  templateOutput: TemplateOutput | null;
  provenance?: any;
  meta?: { coverage?: any; [key: string]: any };
  paging?: { next_page_token?: string; [key: string]: any };
}

// Template output structure that supports both basic text and enriched data formats
interface TemplateOutput {
  text: string; 
  widgets?: any;
  data?: any[];
  context_enriched?: boolean;
  [key: string]: any; // Allow additional properties for flexibility
}

// No dotenv in serverless functions; rely on platform env

// Helpers to detect list widgets robustly (supports `type` or `kind`)

// Helper to get page size for pagination
function getPageSize(): number {
  try {
    const envLimit = process.env.BU_LIST_LIMIT;
    if (envLimit) {
      const parsed = parseInt(envLimit, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return 8; // Default page size if not specified
}

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

// We'll fetch BU chips dynamically when possible
const DEFAULT_BU_CHIPS = [
  { id: 'ALL', label: 'All BUs' },
  { id: 'Z001' },
  { id: 'Z002' },
  { id: 'Z003' },
];

// Special chip types (defined inline where used)
// Removed SHOW_MORE_CHIP and SHOW_ALL_CHIP as they're not needed as constants

// Helper: labelize a BU code as "Z001 — Liferafts" if known
function labelizeUnitCode(code: string): string {
  const lbl = unitLabel(code);
  return lbl && lbl !== code ? `${code} — ${lbl}` : code;
}

// Helper: deep labelize list widgets in-place (supports single or array)
function labelizeWidgets(w: any): any {
  if (!w) return w;
  const apply = (one: any) => {
    try {
      const t = String((one?.type ?? one?.kind ?? '')).toLowerCase();
      if (t === 'list' && Array.isArray(one.items)) {
        one.items = one.items.map((it: any) => {
          const s = String(it ?? '');
          
          // Skip items that already have a label (contain the em dash)
          if (s.includes(' — ')) return s;
          
          // Check if this looks like a BU code (Z followed by numbers)
          if (/^Z\d+$/i.test(s)) {
            const lbl = unitLabel(s);
            return lbl && lbl !== s ? `${s} — ${lbl}` : s;
          }
          
          return s;
        });
      }
    } catch {}
    return one;
  };
  if (Array.isArray(w)) return w.map(apply);
  return apply(w);
}

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
  try {
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
  
  // Get normalized data mode using helper
  const dataMode = getDataMode(); // 'mock' | 'live'
  const rawDataMode = String(process.env.DATA_MODE || 'mock').toLowerCase();
  const strictLive = dataMode === 'live' && !allowMockFallback();
  const polishing = String(process.env.POLISH_NARRATIVE || 'false').toLowerCase() === 'true';
  
  // Initialize BigQuery client with improved error handling
  let bq: ReturnType<typeof makeBQ> | null = null;
  let bqReady: { ok: boolean; reason: string; error?: string } = { ok: false, reason: "UNINIT" };
  
  try {
    bq = makeBQ();                         // uses readServiceAccount()
    const r = await bq.ready();            // SELECT 1
    bqReady = { ok: r.ok, reason: r.ok ? "READY" : "BOOT_FAIL" };
  } catch (e: any) {
    console.error('[ERROR] Failed to initialize BigQuery:', e);
    bqReady = { ok: false, reason: "BOOT_THROW", error: String(e?.message || e) };
  }
  
  // when live and BQ not ready → honest 200/NO_DATA (never throw 502)
  if (dataMode === "live" && (!bq || !bqReady.ok)) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({
        mode: "no_data",
        text: "Live data unavailable right now.",
        widgets: [],
        meta: { groundingType: "template" },
        provenance: { 
          source: "bq", 
          tag: "BQ_ERROR", 
          error_code: bqReady.reason,
          platform: 'netlify',
          fn_dir: 'netlify/functions',
          cred_mode: bqReady.reason === "UNINIT" ? "NONE" : "ATTEMPTED",
          build: process.env.NETLIFY_COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || 'local'
        }
      })
    };
  }

  // Log environment and configuration details
  console.log(`[chat] mode=${dataMode} strict=${strictLive} bqReady=${bqReady.ok} raw=${rawDataMode} polishing=${polishing}`);
  console.log(`[chat] Multi-step prompting: ${String(process.env.ENABLE_MULTI_STEP || 'true').toLowerCase() === 'true' ? 'enabled' : 'disabled'}`);
  console.log(`[chat] LLM Provider: ${process.env.LLM_PROVIDER || 'perplexity'}`);
  console.log(`[chat] Request ID: ${event.headers['x-request-id'] || 'unknown'}-${Date.now()}`);
  

  
  // Constants for metrics used in breakdown template
  const METRIC_OPTIONS = [
    { id: 'revenue', label: 'Revenue' },
    { id: 'costs', label: 'Costs' },
    { id: 'gross', label: 'Gross Profit' }
  ];
  
  // Check for required environment variables (relaxed in mock unless polishing)
  const requiredEnvVars: string[] = [];
  if (dataMode === 'live' || polishing) {
    requiredEnvVars.push('LLM_PROVIDER', 'PERPLEXITY_API_KEY');
  }
  if (dataMode === 'live') {
    requiredEnvVars.push('GOOGLE_APPLICATION_CREDENTIALS');
  }
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    console.error(`[ERROR] Missing required environment variables: ${missingVars.join(', ')}`);
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
        reason: 'missing_env',
        text: 'Service unavailable due to missing environment configuration.',
        details: `Missing environment variables: ${missingVars.join(', ')}`,
        provenance: {
          platform: 'netlify',
          fn_dir: 'netlify/functions',
          tag: 'MISSING_ENV'
        }
      })
    };
  }

  // Validate provider only when required
  const provider = process.env.LLM_PROVIDER || process.env.PROVIDER;
  if ((dataMode === 'live' || polishing) && provider !== 'perplexity') {
    console.error(`[ERROR] Unsupported provider: ${provider}`);
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
        reason: 'unsupported_provider',
        text: 'Configured LLM provider is not supported in this environment.',
        provenance: { platform: 'netlify', fn_dir: 'netlify/functions', tag: 'PROVIDER_UNSUPPORTED', provider }
      })
    };
  }

  const requestBody: Partial<ChatRequest> = event.body ? JSON.parse(event.body) : {} as any;
  const message = (requestBody as any).message as string | undefined;
  const grounding = requestBody.grounding as GroundingPayload | undefined;
  const incomingRouter = requestBody.router as { domain?: string; confidence?: number } | undefined;
  const incomingParams = requestBody.params as Record<string, any> | undefined;
  const clientHints = requestBody.client_hints as { prevDomain?: string | null; prevTemplate?: string | null; prevParams?: Record<string, any> | null; prevTop?: number | null; prevDetail?: number | null } | undefined;
  const templateIdFromBody = typeof requestBody.template === 'string' 
    ? requestBody.template 
    : (requestBody.template && typeof requestBody.template === 'object' 
      ? (requestBody.template as any).id 
      : undefined);
  const history: Array<{role: 'user' | 'assistant'; content: string}> = Array.isArray(requestBody.history) ? (requestBody.history as any) : [];
  
  if (!message) {
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

    // Safety check - initialize defaults_used early to avoid variable declaration issues
    const defaults_used: Record<string, any> = {};
    
    // Slot-fill/Clarify: enforce period defaults and reuse/clarify unit for metric timeseries
    const isTimeseries = (typeof ((templateIdFromBody as string) || det.template_id) === 'string')
      ? (((templateIdFromBody as string) || det.template_id) === 'metric_timeseries_v1')
      : (domainTemplate === 'metric_timeseries_v1');
      
    // Slot-fill/Clarify: enforce metric and period defaults for metric breakdown by unit
    const isBreakdown = (typeof ((templateIdFromBody as string) || det.template_id) === 'string')
      ? (((templateIdFromBody as string) || det.template_id) === 'metric_breakdown_by_unit_v1')
      : (domainTemplate === 'metric_breakdown_by_unit_v1');
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
    }
    
    // Handle metric breakdown by business unit template clarification
    if (isBreakdown) {
      // If metric is not provided, trigger clarification
      if (!params.metric) {
        // Use previous metric if available
        const prevMetric = clientHints?.prevParams?.metric as string | undefined;
        if (prevMetric) {
          params.metric = String(prevMetric).toLowerCase();
        } else {
          // Trigger clarification for metric
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
              text: 'Which metric would you like to break down by business unit?',
              clarify: {
                missing: ['metric'],
                suggestions: { metric: METRIC_OPTIONS }
              },
              meta: {
                domain: det.domain || (routeResult.domain || ''),
                confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
                groundingType: 'clarify'
              },
              provenance: {
                tag: 'CLARIFY_REQUIRED',
                domain: det.domain,
                template: 'metric_breakdown_by_unit_v1',
                state: { params }
              }
            })
          };
        }
      }
      
      // If period is not provided, trigger clarification
      // We check for both period object and individual year/from/to params
      if (!params.period && !params.year && !params.from && !params.to) {
        // Check previous period params
        const prevPeriod = clientHints?.prevParams?.period;
        const prevYear = clientHints?.prevParams?.year;
        
        if (prevPeriod || prevYear) {
          // Reuse previous period info
          if (prevPeriod) params.period = prevPeriod;
          else if (prevYear) params.year = prevYear;
        } else {
          // Default to last 12 months if not specified
          const { from, to } = last12CompleteMonths();
          params.from = from;
          params.to = to;
          defaults_used.period = 'last_12m';
        }
      }
      
      // Handle "Show all" chip functionality
      if (params.showAllUnits === true) {
        // If user explicitly requests all units, remove top limit
        params.top = undefined;
      } else if (!params.top) {
        // Default to showing top 8 business units
        params.top = 8;
      }

      // Unit handling: reuse previous if present; otherwise clarify
      if (!params.unit) {
        const prevUnit = clientHints?.prevParams?.unit as string | undefined;
        if (prevUnit) {
          params.unit = String(prevUnit).toUpperCase();
        } else {
          // Try to get BU list for better clarify chips
          let buChips: Array<{id: string, label: string, action?: string, params?: Record<string, any>}> = [];
          let coverageInfo: any = null;
          let pageToken: string | undefined;
          
          try {
            // Get first page of BU list for clarify
            const buListTemplate = await runTemplate('business_units_list_v1', { limit: getPageSize() }, dataMode) as ExtendedTemplateResult;
            
            // Extract units from the list widget
            const buListWidgets = buListTemplate?.templateOutput?.widgets;
            if (buListWidgets?.type === 'list' && Array.isArray(buListWidgets.items)) {
              // Extract coverage info from the template result
              coverageInfo = buListTemplate?.meta?.coverage || null;
              
              // Get paging token if available
              pageToken = buListTemplate?.paging?.next_page_token;
              
              // Map BU codes to clarify chips
              buChips = buListWidgets.items.map((id: string) => {
                // Extract just the code part if it has a label already
                const code = String(id).split(' — ')[0].trim();
                return {
                  id: code,
                  label: id.includes(' — ') ? id : labelizeUnitCode(code)
                };
              });
              
              // Insert "ALL" option at the top
              buChips.unshift({ id: 'ALL', label: 'All BUs' });
              
              // Add "Show more" chip if there are more pages
              if (pageToken) {
                buChips.push({ 
                  id: 'SHOW_MORE',
                  label: 'Show more',
                  action: 'more',
                  params: { page_token: pageToken }
                });
              }
            }
          } catch (err) {
            console.warn('Failed to get BU list for clarify, using defaults:', err);
          }
          
          // Fall back to default chips if BU list failed
          if (buChips.length === 0) {
            buChips = DEFAULT_BU_CHIPS.map(chip => ({
              id: chip.id,
              label: chip.id === 'ALL' ? 'All BUs' : labelizeUnitCode(chip.id as string)
            }));
          }
          
          // Build clarify text with coverage information if available
          let clarifyText = 'Which business unit should I use for the monthly gross trend?';
          if (coverageInfo) {
            clarifyText += ` Found ${coverageInfo.total} business units; showing ${coverageInfo.shown}.`;
          }
          
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
              text: clarifyText,
              clarify: {
                missing: ['unit'],
                suggestions: { unit: buChips }
              },
              meta: {
                domain: det.domain || (routeResult.domain || ''),
                confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
                groundingType: 'clarify',
                coverage: coverageInfo,
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

    // If we filled timeseries or breakdown from/to above, record it here for transparency
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

        // Labelize list widgets coming from templates (exec-friendly)
        const primaryLabeledWidgets = labelizeWidgets(templateData.templateOutput?.widgets);

        // Ensure template output has correct typing
        const primaryTypedOutput = templateData.templateOutput as TemplateOutput | null;
        
        groundingData = {
          domain: det.domain || (routeResult.domain || ''),
          confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: primaryTypedOutput ? { ...primaryTypedOutput, widgets: primaryLabeledWidgets ?? primaryTypedOutput.widgets } : null,
          groundingType: 'template'
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we're in mock mode or (live mode with mock fallback allowed), try template
    if (((dataMode === 'live' && allowMockFallback()) || dataMode === 'mock') && !groundingData && domainTemplate && (typeof routeResult.confidence !== 'number' || routeResult.confidence >= 0.3)) {
      try {
        console.info(`[Netlify] Generating grounding data (fallback) for: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, params ?? null);

        // Labelize list widgets coming from templates (exec-friendly)
        if (templateData.templateOutput?.widgets) {
          templateData.templateOutput.widgets = labelizeWidgets(templateData.templateOutput.widgets);
        }

        // Handle business unit importance ranking with enrichment
        if (domainTemplate === 'business_units_ranking_v1' && templateData.templateOutput) {
          try {
            console.log(`[DEBUG] Template output structure:`, JSON.stringify(templateData.templateOutput));
            
            // Get business unit data from template output
            // Handle both structures: { data: [] } and direct array formats for flexibility
            let buData: any[] = [];
            if (Array.isArray(templateData.templateOutput)) {
              buData = templateData.templateOutput;
            } else {
              // Safe access to the data property which might not exist
              const output = templateData.templateOutput as TemplateOutput;
              if (Array.isArray(output.data)) {
                buData = output.data;
              } else if (typeof output.text !== 'string' && Array.isArray(output.text)) {
                buData = output.text;
              }
            }
            
            // If we have a JSON string, try to parse it
            if (typeof buData === 'string') {
              try {
                buData = JSON.parse(buData);
              } catch (e) {
                console.warn('[WARN] Could not parse BU data string as JSON');
                buData = [];
              }
            }
            
            const metric = params.metric || 'revenue';
            const contextRequest = params.context_request || 'top_performers';
            
            console.log(`[INFO] Processing business unit ranking with metric=${metric}, contextRequest=${contextRequest}`);
            console.log(`[DEBUG] BU Data structure:`, typeof buData, Array.isArray(buData), buData && Array.isArray(buData) ? buData.length : 0);
            
            if (buData && Array.isArray(buData) && buData.length > 0) {
              console.log(`[INFO] Business units found: ${buData.length}`);
              console.log(`[DEBUG] First BU:`, JSON.stringify(buData[0]));
              
              const enrichedData = await enrichBusinessUnitData(buData, metric, contextRequest);
              const synthesizedResponse = await synthesizeBuImportanceResponse(enrichedData, metric, contextRequest);
              
              // Store the enriched data and synthesized response
              if (Array.isArray(templateData.templateOutput)) {
                templateData.templateOutput = { 
                  data: enrichedData, 
                  text: synthesizedResponse,
                  context_enriched: true 
                } as TemplateOutput;
              } else {
                const output = templateData.templateOutput as TemplateOutput;
                output.data = enrichedData;
                output.text = synthesizedResponse;
                output.context_enriched = true;
              }
              
              console.log(`[INFO] Successfully enriched business unit data with ${contextRequest} context`);
            } else {
              // No data was available from BigQuery
              
              if (dataMode === 'live') {
                // In live mode, always return an honest no_data response
                console.log('[INFO] Live mode - returning honest no_data response with context');
                
                // Create a more informative no-data response that explains data limitations
                const noDataResponse = {
                  text: "The requested business unit data is unavailable. This may be because the data is not in the current backup file provided, which is limited to specific business metrics and time periods. The backup file we're working with may not contain this specific information.",
                  widgets: [],
                  meta: { groundingType: "template" },
                  provenance: { 
                    source: "bq", 
                    tag: bqReady.ok ? "NO_DATA_ENRICHMENT" : "BQ_ERROR_ENRICHMENT",
                    error_msg: bqReady.ok ? undefined : (bqReady.error || "BigQuery connection error") 
                  }
                };
                
                if (Array.isArray(templateData.templateOutput)) {
                  templateData.templateOutput = noDataResponse;
                } else if (templateData.templateOutput) {
                  // Update the existing output with no_data response
                  Object.assign(templateData.templateOutput, noDataResponse);
                }
                
                // Also add provenance at the template result level
                templateData.provenance = { ...noDataResponse.provenance };
              }
              // Only generate mock data in explicit mock mode
              else if (dataMode === 'mock') {
                console.log('[INFO] Generating mock business unit data for enrichment');
                
                // Create minimal mock data structure for enrichment
                const mockBuData = [
                  {
                    bu_code: 'Z001',
                    bu_name: 'Liferafts',
                    metric_value: 1200000,
                    percentage_of_total: 35.2,
                    yoy_growth_pct: 12.3,
                    importance_level: contextRequest === 'top_performers' ? 'Most Important' : 'Least Performing',
                    importance_reason: contextRequest === 'top_performers' ? 
                      'Major contributor with over 25% of total' : 
                      'Underperforming despite significant market share'
                  },
                  {
                    bu_code: 'Z002',
                    bu_name: 'Safety Equipment',
                    metric_value: 980000,
                    percentage_of_total: 28.7,
                    yoy_growth_pct: 8.5,
                    importance_level: 'Very Important',
                    importance_reason: 'Consistent performer'
                  },
                  {
                    bu_code: 'Z003',
                    bu_name: 'Navigation Systems',
                    metric_value: 750000,
                    percentage_of_total: 22.0,
                    yoy_growth_pct: 15.2,
                    importance_level: 'Important',
                    importance_reason: 'Fast growing unit with over 20% YoY growth'
                  }
                ];
                
                // Enrich the mock data
                const enrichedData = await enrichBusinessUnitData(mockBuData, metric, contextRequest);
                const synthesizedResponse = await synthesizeBuImportanceResponse(enrichedData, metric, contextRequest);
                
                // Use the enriched mock data with clear provenance marking
                const mockResponse = {
                  data: enrichedData, 
                  text: synthesizedResponse,
                  context_enriched: true,
                  meta: { groundingType: "template" },
                  provenance: { source: "mock", tag: "MOCK_DATA_ENRICHMENT" }
                };
                
                if (Array.isArray(templateData.templateOutput)) {
                  templateData.templateOutput = mockResponse as TemplateOutput;
                } else if (templateData.templateOutput) {
                  Object.assign(templateData.templateOutput, mockResponse);
                }
                
                // Also add provenance at the template result level
                templateData.provenance = { ...mockResponse.provenance };
                
                console.log(`[INFO] Successfully created mock business unit data with ${contextRequest} context`);
              } else {
                console.log(`[WARN] No business unit data available to enrich and not in mock mode`);
              }
            }
          } catch (err) {
            console.error(`[ERROR] Failed to enrich business unit data:`, err);
            // Continue with original data if enrichment fails
          }
        }

        // Labelize list widgets coming from templates (exec-friendly)
        const fallbackLabeledWidgets = labelizeWidgets(templateData.templateOutput?.widgets);

        // Ensure template output has correct typing
        const fallbackTypedOutput = templateData.templateOutput as TemplateOutput | null;
        
        groundingData = {
          domain: det.domain || (routeResult.domain || ''),
          confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: fallbackTypedOutput ? { ...fallbackTypedOutput, widgets: fallbackLabeledWidgets ?? fallbackTypedOutput.widgets } : null,
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
      // Check if this might be a user protesting about mock data
      const isMockDataProtest = /\b(wrong|incorrect|not correct|not our|not ours|doesn't exist|does not exist|that company|fake|made up|fictional|that's not|invalid|nonexistent|isn't real|is not real|acme|globex|oceanic|seasecure|marinemac)\b/i.test(message.toLowerCase());

      let responseText = 'I don\'t have the data you\'re looking for right now.';
      let responseReason = 'no_grounding_data';
      
      // If it's a protest about mock data, provide clearer explanation
      if (dataMode === 'mock' && isMockDataProtest) {
        responseText = 'You\'re viewing demo data with fictional companies. Switch to live BigQuery data by enabling DATA_MODE=bq and configuring BigQuery credentials in your environment variables.';
        responseReason = 'mock_data_explanation';
      }
      // If in live mode with mock fallback disabled
      else if (dataMode === 'live' && !allowMockFallback) {
        responseText = 'Live data connection failed and mock fallback is disabled. Please check your BigQuery configuration and ensure your dataset exists.';
        responseReason = 'live_data_error_no_fallback';
      }

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
          text: responseText,
          abstain_reason: responseReason,
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
        
        // Call LLM provider using multi-step prompting
        try {
          console.log('[chat] Using multi-step prompting with template data');
          const enableMultiStep = String(process.env.ENABLE_MULTI_STEP || 'true').toLowerCase() === 'true';
          
          if (enableMultiStep) {
            responseText = await generateMultiStepResponse(
              message,
              systemPrompt,
              templateOutput,
              history || [],
              domain
            );
          } else {
            // Fallback to single-step if multi-step is disabled
            responseText = await callLLMProvider(message, systemPrompt, history || [], templateOutput, domain);
          }
        } catch (error) {
          console.error('[chat] Error in LLM processing:', error);
          // Graceful error handling
          responseText = `I encountered a technical issue while processing your request. Please try again or contact support if the problem persists.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`;
          provenanceTag = 'ERROR_LLM_PROCESSING';
        }
      }
    } else if (bigQueryData) {
      // Format BigQuery results
      const resultsText = JSON.stringify(bigQueryData, null, 2);
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.\n
BIGQUERY DATA:\n${resultsText}`;
      
      // Call LLM provider using multi-step prompting
      try {
        console.log('[chat] Using multi-step prompting with BigQuery data');
        const enableMultiStep = String(process.env.ENABLE_MULTI_STEP || 'true').toLowerCase() === 'true';
        
        if (enableMultiStep) {
          responseText = await generateMultiStepResponse(
            message,
            systemPrompt,
            bigQueryData,
            history || [],
            domain
          );
        } else {
          // Fallback to single-step if multi-step is disabled
          responseText = await callLLMProvider(message, systemPrompt, history || [], bigQueryData, domain);
        }
      } catch (error) {
        console.error('[chat] Error in LLM processing with BigQuery data:', error);
        // Graceful error handling
        responseText = `I encountered a technical issue while processing your request. Please try again or contact support if the problem persists.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`;
        provenanceTag = 'ERROR_LLM_PROCESSING';
      }
    } else {
      // Generic prompt when no grounding
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer questions about financial KPIs and business metrics. If you don't know the answer, say "I don't have that information available." DO NOT make up data.`;
      
      // Call LLM provider - simplified approach for generic queries without grounding data
      try {
        console.log('[chat] Using single-step prompting for generic query');
        // For generic queries without data, multi-step isn't as useful, so use single-step by default
        responseText = await callLLMProvider(message, systemPrompt, history || [], null, domain, 'reasoning');
      } catch (error) {
        console.error('[chat] Error in LLM processing generic query:', error);
        // Graceful error handling
        responseText = `I encountered a technical issue while processing your request. Please try again or contact support if the problem persists.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`;
        provenanceTag = 'ERROR_LLM_PROCESSING';
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
    
    // Labelize widgets one last time if any slipped through
    widgets = labelizeWidgets(widgets);

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
  // merged into 200-always catch below
  } catch (e: any) {
    // 200-always error handling wrapper - never throw 502 errors
    console.error('[CRITICAL] Unhandled exception in chat handler:', e);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({
        mode: 'no_data',
        text: 'An error occurred processing your request.',
        widgets: [],
        meta: { groundingType: 'error' },
        provenance: { 
          source: 'error', 
          tag: 'UNHANDLED_EXCEPTION',
          error_code: String(e?.code || 'UNKNOWN'),
          error_message: String(e?.message || e),
          platform: 'netlify',
          fn_dir: 'netlify/functions',
          build: process.env.NETLIFY_COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || 'local'
        }
      })
    };
  }
};

export { handler };
