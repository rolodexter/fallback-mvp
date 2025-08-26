import { Handler } from '@netlify/functions';
import { callLLMProvider } from '../../src/services/llmProvider';
import { GroundingPayload } from '../../src/services/chatClient';
import { routeMessage as domainRouteMessage } from '../../src/data/router/router';
import { routeMessage as topicRouteMessage } from '../../src/data/router/topicRouter';
import { runTemplate } from '../../src/data/templates';
import { rewriteMessage } from '../../src/services/semanticRewrite';
import { unitLabel } from '../../src/data/labels';
import { enrichBusinessUnitData, synthesizeBuImportanceResponse } from '../../src/services/buEnrichment';

// Broad greeting/help detector used for server-side fallback
const GREET_RE = /\b(hi|hello|hey|yo|howdy|greetings|good\s+(morning|afternoon|evening)|help|start|get(ting)?\s+started|what\s+can\s+you\s+do)\b/i;

// Supported data modes
type DataMode = 'mock' | 'live';

// Extended template result with additional metadata fields
interface ExtendedTemplateResult {
  kpiSummary: any;
  templateOutput: { text: string; widgets?: any; } | null;
  provenance?: any;
  meta?: { coverage?: any; [key: string]: any };
  paging?: { next_page_token?: string; [key: string]: any };
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
  const dataMode: DataMode = (String(process.env.DATA_MODE || 'mock').toLowerCase() === 'mock' ? 'mock' : 'live');
  const polishing = String(process.env.POLISH_NARRATIVE || 'false').toLowerCase() === 'true';
  const allowMockFallback = String(process.env.ALLOW_MOCK_FALLBACK || 'true').toLowerCase() !== 'false';
  console.log(`[Netlify] Using data mode: ${dataMode} | polishing=${polishing} | allowMockFallback=${allowMockFallback}`);
  
  // Constants for metrics used in breakdown template
  const METRIC_OPTIONS = [
    { id: 'revenue', label: 'Revenue' },
    { id: 'costs', label: 'Costs' },
    { id: 'gross', label: 'Gross Profit' }
  ];
  
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
        const labeledWidgets = labelizeWidgets(templateData.templateOutput?.widgets);

        groundingData = {
          domain: det.domain || (routeResult.domain || ''),
          confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput ? { ...templateData.templateOutput, widgets: labeledWidgets ?? templateData.templateOutput.widgets } : null,
          groundingType: 'template'
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we're in mock mode or (live mode with mock fallback allowed), try template
    if (((dataMode === 'live' && allowMockFallback) || dataMode === 'mock') && !groundingData && domainTemplate && (typeof routeResult.confidence !== 'number' || routeResult.confidence >= 0.3)) {
      try {
        console.info(`[Netlify] Generating grounding data (fallback) for: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, params ?? null);

        // Labelize list widgets coming from templates (exec-friendly)
        const labeledWidgets = labelizeWidgets(templateData.templateOutput?.widgets);

        // Handle business unit importance ranking with enrichment
        if (domainTemplate === 'business_units_ranking_v1' && templateData.templateOutput) {
          try {
            console.log('[Netlify] Enriching business unit importance data with context');
            const buData = templateData.templateOutput.data;
            const metric = params.metric || 'revenue';
            
            if (buData && Array.isArray(buData) && buData.length > 0) {
              // Enrich business unit data with contextual information
              const enrichedData = await enrichBusinessUnitData(buData, metric);
              
              // Synthesize natural language response
              const synthesizedResponse = await synthesizeBuImportanceResponse(enrichedData, metric);
              
              // Update template output with enriched data and response
              templateData.templateOutput.data = enrichedData;
              templateData.templateOutput.text = synthesizedResponse;
              templateData.templateOutput.context_enriched = true;
              
              console.log('[Netlify] Successfully enriched business unit importance data');
            }
          } catch (enrichErr) {
            console.error('[ERROR] Failed to enrich business unit data:', enrichErr);
            // Continue with original template data if enrichment fails
          }
        }

        groundingData = {
          domain: det.domain || (routeResult.domain || ''),
          confidence: (typeof routeResult.confidence === 'number' ? routeResult.confidence : 0.9),
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput ? { ...templateData.templateOutput, widgets: labeledWidgets ?? templateData.templateOutput.widgets } : null,
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
