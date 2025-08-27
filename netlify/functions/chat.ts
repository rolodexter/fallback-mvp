import type { Handler } from '@netlify/functions';
import { GroundingPayload } from '../../src/services/chatClient';
import { routeMessage as domainRouteMessage } from '../../src/data/router/router';
import { routeMessage as topicRouteMessage } from '../../src/data/router/topicRouter';
import { runTemplate, isLiveRun, hasPayload, Provenance } from '../../src/data/templates';
// Consultant brief (deterministic narrative)
import { buildFactsPack } from '../../src/lib/narrative/facts';
import { draftSkeleton } from '../../src/lib/narrative/skeleton';
import { fillPlaceholders as fillBriefPlaceholders, guardNoNewNumbers } from '../../src/lib/narrative/fill';
import { chipsFor } from '../../src/lib/narrative/chips';
import { rewriteMessage } from '../../src/services/semanticRewrite';
import { enrichBusinessUnitData, synthesizeBuImportanceResponse } from '../../src/services/buEnrichment';
import { unitLabel } from '../../src/data/labels';
import { getDataMode, allowMockFallback } from '../../src/lib/dataMode';
import { makeBQ } from '../../src/lib/bq';

// Helper set to parse boolean env vars consistently
const envTrue = new Set(['1', 'true', 'yes', 'y']);

// Parse environment flags once for consistent usage
const ENABLE_MULTI_STEP = envTrue.has(String(process.env.ENABLE_MULTI_STEP || 'true').toLowerCase());
const POLISH_NARRATIVE = envTrue.has(String(process.env.POLISH_NARRATIVE || 'true').toLowerCase());
// Environmental flags - keep these for configuration consistency

// Broad greeting/help detector used for server-side fallback
const GREET_RE = /\b(hi|hello|hey|yo|howdy|greetings|good\s+(morning|afternoon|evening)|help|start|get(ting)?\s+started|what\s+can\s+you\s+do)\b/i;

// Using DataMode from dataMode.ts import

// Helper to list missing env keys (trim-aware)
function missingEnv(keys: string[]) {
  return keys.filter(k => !String(process.env[k] || '').trim());
}

// Extended template result with additional metadata fields
interface ExtendedTemplateResult {
  kpiSummary?: any; // Made optional to fix lint warning
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
export const handler: Handler = async (event) => {
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
  
  // Live-mode gate: verify core BQ config and any credential form
  if (dataMode === 'live') {
    // Minimal required keys for BigQuery client
    const core = ['GOOGLE_PROJECT_ID'];
    const missCore = missingEnv(core);
    const hasCreds = Boolean(
      (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '').trim() ||
      (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64  || '').trim() ||
      (process.env.GOOGLE_APPLICATION_CREDENTIALS      || '').trim()
    );

    if (missCore.length || !hasCreds) {
      const missing_env = [...missCore, ...(hasCreds ? [] : ['CREDENTIALS'])];
      console.error(`[ERROR] Missing live env: ${missing_env.join(', ')}`);
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
          reason: 'missing_env',
          text: 'Service unavailable due to missing environment configuration.',
          widgets: [],
          meta: { groundingType: 'template' },
          provenance: {
            source: 'bq',
            tag: 'MISSING_ENV',
            reason: 'missing_env',
            missing_env
          }
        })
      };
    }
  }

  // Validate provider only when required
  const provider = process.env.LLM_PROVIDER ?? process.env.PROVIDER ?? 'perplexity';
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

  // If provider is Perplexity and we're in live/polish path, ensure API key exists
  if ((dataMode === 'live' || polishing) && provider === 'perplexity') {
    const hasPplxKey = Boolean((process.env.PERPLEXITY_API_KEY || '').trim() || (process.env.PPLX_API_KEY || '').trim());
    if (!hasPplxKey) {
      console.error('[ERROR] Missing Perplexity API key');
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
          reason: 'missing_env',
          text: 'Perplexity API key not configured.',
          widgets: [],
          meta: { groundingType: 'template' },
          provenance: {
            source: 'llm',
            tag: 'MISSING_ENV',
            reason: 'missing_env',
            missing_env: ['PERPLEXITY_API_KEY or PPLX_API_KEY']
          }
        })
      };
    }
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
  // We don't need history anymore since we've removed LLM calls
  // const history = Array.isArray(requestBody.history) ? (requestBody.history as any) : [];
  
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
          groundingType: 'template',
          provenance: templateData?.provenance
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
                    source: "bq" as const, 
                    tag: bqReady.ok ? "NO_DATA_ENRICHMENT" : "BQ_ERROR_ENRICHMENT",
                    error_msg: bqReady.ok ? undefined : (bqReady.error || "BigQuery connection error") 
                  } as Provenance
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
                  provenance: { source: "mock" as const, tag: "MOCK_DATA_ENRICHMENT" } as Provenance
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
          bigQueryData: null,
          provenance: templateData?.provenance
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
    // We don't need kpiSummary directly since we extract it later when needed
    // const kpiSummary = groundingData.kpiSummary || null;
    let groundingType = groundingData.groundingType;
    
    console.log(`Using domain: ${domain}, Grounding type: ${groundingType}`);
    
    // We don't need systemPrompt since we've removed LLM calls
    // let systemPrompt = '';
    let responseText = '';
    // Initialize templateText that will be used for fallbacks throughout the function
    let templateText = '';
    let widgets = null;
    let kpisOut: any[] = [];
    let provenanceTag: string | undefined;
    
    // For template/mock data mode, we can use the template output directly
    try {
      if (templateOutput) {
        // Normalize template output to string and carry widgets through
        if (typeof templateOutput === 'string') {
          templateText = templateOutput;
        } else if (templateOutput && typeof templateOutput === 'object') {
          templateText = (templateOutput as any).text || '';
        }
        
        // Fall back to JSON or string conversion if needed
        if ((!templateText || typeof templateText !== 'string') && templateOutput) {
          try { 
            templateText = JSON.stringify(templateOutput); 
          } catch { 
            templateText = String(templateOutput); 
          }
        }
        
        // Extract widgets if available
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
          } catch (err) {
            console.warn('Error normalizing KPIs:', err);
          }
          
          // Strict gate: only synthesize when live BigQuery with successful template payload
          try {
            // Use pre-parsed flag instead of parsing on every request
            const liveOk = isLiveRun({ provenance: groundingData?.provenance as Provenance });
            const payloadOk = hasPayload(templateOutput as any);
            const gateOk = ENABLE_MULTI_STEP && liveOk && payloadOk;
            console.log('[chat] synthesis gate', { ENABLE_MULTI_STEP, liveOk, payloadOk, gateOk });

            if (gateOk) {
              // Consultant Brief Implementation
              try {
                console.log('[chat] Generating consultant brief');
                const facts = buildFactsPack(templateOutput, params);
                const skeleton = draftSkeleton(facts); // Correct call with single parameter
                let brief = fillBriefPlaceholders(skeleton, facts);
                
                // Polishing disabled in this build to avoid provider arity/type mismatch; keep deterministic text.
                provenanceTag = isListOnly(templateOutput?.widgets) ? 'POLISH_SKIPPED_LIST_ONLY' : 'POLISH_SKIPPED_OFF';

                // Set the response text to our brief
                responseText = brief;

                // Generate drill-down chips
                const chips = chipsFor(facts, params?.template_id || '');
                if (chips && chips.length > 0 && templateOutput && typeof templateOutput === 'object') {
                  (templateOutput as any).suggestions = chips;
                }

                provenanceTag = 'LLM_SYNTHESIS_V1';
                groundingType = 'synthesis';
              } catch (error) {
                console.error('[chat] Error in consultant brief generation:', error);
                // On synthesis error, return deterministic template output
                responseText = templateText;
                provenanceTag = 'LLM_SKIPPED_ERROR';
              }
            } else {
              // Deterministic: return template text unchanged
              responseText = templateText;
              provenanceTag = provenanceTag || 'LLM_SKIPPED_GATE';
            }
          } catch (error) {
            console.error('[chat] Error in synthesis gate processing:', error);
            // On synthesis error, return deterministic template output
            responseText = templateText;
            provenanceTag = 'LLM_SYNTHESIS_ERROR';
          }
        }
      }
    } catch (error) {
      console.error('[chat] Error in LLM processing:', error);
      // On synthesis error, return deterministic template output
      responseText = templateText;
      provenanceTag = 'LLM_SKIPPED_ERROR';
    }
    
    if (!templateOutput && bigQueryData) {
      // Format BigQuery results for logging purposes
      console.log(`[BigQuery] Processing BigQuery data: ${bigQueryData ? 'found' : 'none'}`);
      // We don't use systemPrompt anymore since we're not calling LLM
      
      // Define fallback text for BigQuery data without template
      const defaultResponseText = "Here's what I found in our financial database. Please let me know if you need more specific information.";
      
      // Process with BigQuery data
      try {
        console.log('[chat] Processing BigQuery data without template');
        // Use pre-parsed environment flags
        
        if (ENABLE_MULTI_STEP) {
          // Use deterministic consultant brief processing
          console.log('[chat] Using deterministic consultant brief generation for BigQuery data');
          responseText = defaultResponseText;
          // Note: Actual consultant brief processing would happen here if we had template output
        } else {
          // Skip consultant brief if multi-step is disabled
          console.log('[chat] Using simple BigQuery response (ENABLE_MULTI_STEP is off)');
          responseText = defaultResponseText;
          provenanceTag = 'BQ_DIRECT';
        }
      } catch (error) {
        console.error('[chat] Error in LLM processing with BigQuery data:', error);
        // Graceful error handling
        responseText = `I encountered a technical issue while processing your request. Please try again or contact support if the problem persists.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`;
        provenanceTag = 'ERROR_LLM_PROCESSING';
      }
    } else {
      // Generic prompt when no grounding - no longer needed since we're not calling LLM
      // We now use a static fallback response instead
      
      // Handle generic queries without grounding data
      try {
        console.log('[chat] Using static response for generic query');
        // For generic queries without data, return a fixed fallback response
        responseText = "I'm sorry, but I need more specific context to answer your question. Please try asking about a specific business unit, metric, or time period.";
        provenanceTag = 'STATIC_FALLBACK';
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

// Handler exported as named export above
