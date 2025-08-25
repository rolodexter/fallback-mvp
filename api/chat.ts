import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel Node runtime configuration
export const config = { runtime: 'nodejs' };

type DataMode = 'mock' | 'live';

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

  // 2) Normalize data mode ('bq' -> 'live')
  const RAW_MODE = String(process.env.DATA_MODE ?? 'mock').toLowerCase();
  const DATA_MODE: DataMode = RAW_MODE === 'bq' ? 'live' : (RAW_MODE === 'live' ? 'live' : 'mock');

  // If no message, return a friendly diagnostic instead of 405/400
  if (!userMessage) {
    return response.status(200).json({
      mode: 'nodata',
      reason: 'missing_message',
      text: 'No message provided.',
      provenance: { source: 'mock', tag: 'NO_MESSAGE' }
    });
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
    route = await routeMessage(userMessage);
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
      provenance: { source: 'mock', tag: 'NO_GROUNDING', router_debug: route }
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
    const tpl = await runTemplate(route.template_id, route.params ?? {}, DATA_MODE);

    // Normalize output: prefer nested templateOutput fields if present
    const out = (tpl as any)?.templateOutput;
    let text: string =
      (tpl as any)?.text ??
      (typeof out === 'string' ? out : (out && typeof out === 'object' ? (out as any).text : undefined)) ??
      'No text.';
    let widgets: any =
      (tpl as any)?.widgets ??
      ((out && typeof out === 'object') ? ((out as any).widgets ?? null) : null);

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
        groundingType: 'drilldown'
      },
      provenance: {
        source: RAW_MODE === 'bq' ? 'bq' : (RAW_MODE === 'live' ? 'live' : 'mock'),
        tag: 'TEMPLATE_RUN',
        template_id: route.template_id,
        domain: route.domain,
        params: route.params,
        router_debug: route,
        bq: bqDiag || undefined
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
