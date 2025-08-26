import type { VercelRequest, VercelResponse } from '@vercel/node';
import { unitLabel } from '../src/data/labels';

// Vercel Node runtime configuration
export const config = { runtime: 'nodejs' };

type DataMode = 'mock' | 'live';

// Helper to get page size for pagination
function getPageSize(): number {
  try {
    const envLimit = process.env.BU_LIST_LIMIT;
    if (envLimit) {
      const parsed = parseInt(envLimit, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return 8; // Default page size
}

// Normalize data mode and replace RAW_MODE in the file
function getDataMode(): DataMode {
  // Read from env first
  const raw = String(process.env.DATA_MODE || '').toLowerCase();
  if (raw === 'bq' || raw === 'live') return 'live';
  // Default to mock if not explicitly set
  return 'mock';
}

// Helper used for chip creation when we need individual codes
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

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // 1) Safe body parse + GET fallback
  let body: any = {};
  try {
    const raw = (request as any).body;
    body = typeof raw === 'string' && raw ? JSON.parse(raw) : (raw ?? {});
  } catch {
    body = {};
  }
  const userMessage = String((body?.message ?? (request.query as any)?.message ?? ''));

  // 2) getDataMode() used throughout for consistent mode handling

  // If no message, return a friendly diagnostic instead of 405/400
  if (!userMessage) {
    return response.status(200).json({
      mode: 'nodata',
      reason: 'missing_message',
      text: 'No message provided.',
      provenance: { source: 'mock', tag: 'NO_MESSAGE' }
    });
  }

  // 2b) Optional LLM rewrite (guarded, fast, non-blocking semantics)
  const originalMessage = userMessage;
  let message = userMessage;
  let rewriteInfo: any = null;
  let rewriteApplied = false;
  try {
    const { rewriteMessage } = await import('../src/services/semanticRewrite.js');
    const out = await rewriteMessage(originalMessage);
    const llmEnabled = String(process.env.NARRATIVE_MODE || '').toLowerCase() === 'llm';
    const envThresh = Number(process.env.LLM_REWRITE_CONFIDENCE ?? 0.6);
    const thresh = llmEnabled ? envThresh : Math.min(envThresh, 0.5);
    if (out && (out.confidence ?? 0) >= thresh) {
      message = out.canonical;
      rewriteApplied = true;
      rewriteInfo = { tag: 'LLM_REWRITE_APPLIED', rewriteConfidence: out.confidence, originalMessage, rewritten: message, llmEnabled };
    }
  } catch (e) {
    rewriteInfo = { tag: 'LLM_REWRITE_FAIL', error: (e as any)?.message ?? String(e), originalMessage };
  }

  // 3) Lazy import the router with guard
  let routeMessage: undefined | ((x: string) => any);
  try {
    const mod = await import('../src/data/router/topicRouter.js');
    routeMessage = mod?.routeMessage;
    if (typeof routeMessage !== 'function') throw new Error('routeMessage not found');
  } catch (e: any) {
    return response.status(200).json({
      mode: 'abstain',
      text: 'Router import failed.',
      provenance: { source: 'mock', tag: 'IMPORT_ROUTER_FAIL', error: e?.message ?? String(e) }
    });
  }

  // 4) Route the message
  let route: any;
  try {
    route = await routeMessage(message);
  } catch (e: any) {
    return response.status(200).json({
      mode: 'abstain',
      text: 'Router error.',
      provenance: { source: 'mock', tag: 'ROUTER_RUNTIME', error: e?.message ?? String(e) }
    });
  }

  if (!route?.template_id) {
    return response.status(200).json({
      mode: 'abstain',
      text: 'No deterministic grounding available (Stage-A).',
      provenance: { source: 'mock', tag: 'NO_GROUNDING', router_debug: route, ...(rewriteInfo ? { rewriteInfo } : {}) }
    });
  }

  // 5) Lazy import templates with guard
  let runTemplate: undefined | ((id: string, p: any, m: DataMode) => Promise<any>);
  try {
    const mod = await import('../src/data/templates/index.js');
    runTemplate = mod?.runTemplate;
    if (typeof runTemplate !== 'function') throw new Error('runTemplate not found');
  } catch (e: any) {
    return response.status(200).json({
      mode: 'abstain',
      text: 'Template runtime import failed.',
      provenance: { source: 'mock', tag: 'IMPORT_TEMPLATES_FAIL', error: e?.message ?? String(e) }
    });
  }

  // 6) Execute template with full guard
  try {
    // Check for missing params that need clarification
    const clarifyData: any = {};
    
    // Special case: if we need a unit param but don't have it,
    // pull the BU list to populate clarify chips
    if (route.template_id !== 'business_units_list_v1' && 
        (route.params?.unit === undefined || route.params?.unit === null)) {
      try {
        // Dynamic BU list fetch for clarify chips
        const buList = await runTemplate('business_units_list_v1', { limit: getPageSize() }, getDataMode());
        
        if (buList?.widgets?.[0]?.items?.length) {
          // Build chips from the list items
          const chips = [
            { id: 'ALL', label: 'All BUs', params: {} },
            ...(buList.widgets[0].items.map((item: string) => {
              const parts = item.split(' — ');
              const id = parts[0];
              return {
                id,
                label: item,
                params: { unit: id }
              };
            }))
          ];
          
          // Add 'Show more' chip if pagination is available
          if (buList?.meta?.paging?.next_page_token) {
            chips.push({
              id: 'MORE',
              label: 'Show more',
              params: { page_token: buList.meta.paging.next_page_token }
            });
          }
          
          // Build a nice clarify prompt with coverage info
          let prompt = 'Which business unit are you interested in?';
          if (buList?.meta?.coverage) {
            const { shown, total } = buList.meta.coverage;
            prompt = `Which business unit are you interested in? ${shown} of ${total} BUs shown.`;
          }
          
          clarifyData.unit = {
            param: 'unit',
            prompt,
            chips
          };
        }
      } catch (e) {
        // Fallback to defaults
        const DEFAULT_BU_CHIPS = [
          { id: 'Z001', label: 'Z001 — Liferafts', params: { unit: 'Z001' } },
          { id: 'Z002', label: 'Z002 — Safety', params: { unit: 'Z002' } },
          { id: 'Z003', label: 'Z003 — Navigation', params: { unit: 'Z003' } },
          { id: 'ALL', label: 'All BUs', params: {} }
        ];
        
        clarifyData.unit = {
          param: 'unit',
          prompt: 'Which business unit would you like to see?',
          chips: DEFAULT_BU_CHIPS
        };
      }
      
      // If we have clarify data, return it now
      if (Object.keys(clarifyData).length > 0) {
        return response.status(200).json({
          mode: 'clarify',
          text: clarifyData[Object.keys(clarifyData)[0]].prompt,
          clarify: clarifyData,
          meta: { groundingType: rewriteApplied ? 'llm_rewrite' : 'clarify' },
          provenance: { source: 'router', tag: 'CLARIFY_PROMPT' }
        });
      }
    }
    
    // Run the template with params
    const tpl = await runTemplate(route.template_id, route.params ?? {}, getDataMode());

    // Normalize output: prefer nested templateOutput fields if present
    const out = (tpl as any)?.templateOutput;
    let text: string =
      (tpl as any)?.text ??
      (typeof out === 'string' ? out : (out && typeof out === 'object' ? (out as any).text : undefined)) ??
      'No text.';
    let widgets: any =
      (tpl as any)?.widgets ??
      ((out && typeof out === 'object') ? ((out as any).widgets ?? null) : null);
    
    // Labelize list widgets for executive-friendly display
    widgets = labelizeWidgets(widgets);

    // Pull BigQuery telemetry from per-call template provenance when available
    const bqDiag: any = tpl?.provenance?.bq || null;

    return response.status(200).json({
      mode: 'strict',
      text,
      kpis: tpl?.kpiSummary ?? null,
      widgets,
      meta: {
        domain: route?.domain ?? null,
        confidence: typeof route?.confidence === 'number' ? route.confidence : 1,
        groundingType: rewriteApplied ? 'llm_rewrite' : 'drilldown',
        coverage: tpl?.meta?.coverage || null,
        paging: tpl?.meta?.paging || null
      },
      provenance: {
        source: getDataMode(),
        tag: 'TEMPLATE_RUN',
        template_id: route.template_id,
        domain: route.domain,
        params: route.params,
        router_debug: route,
        bq: bqDiag || undefined,
        rewriteApplied: rewriteApplied || undefined,
        ...(rewriteInfo ?? {})
      }
    });
  } catch (e: any) {
    return response.status(200).json({
      mode: 'abstain',
      text: 'Runtime guard (mock).',
      provenance: { source: 'mock', tag: 'CHAT_RUNTIME', error: e?.message ?? String(e) }
    });
  }
}
