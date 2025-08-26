import { executeBigQuery } from '../../services/bigQueryClient.js';

// id: metric_snapshot_year_v1
// domain: metrics
// Params: { metric: 'costs'|'revenue'|'gross'|'expenses'; year: number; unit?: string|null; currency?: string|null }

function hashDeterministic(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function runMock(params: Record<string, any> = {}) {
  const metric: string = (params.metric || 'costs').toString().toLowerCase();
  const metricNorm = metric === 'expenses' ? 'costs' : metric;
  const year: number = (typeof params.year === 'number' && !Number.isNaN(params.year))
    ? params.year
    : (new Date().getFullYear() - 1);
  const unit: string | undefined = params.unit ? String(params.unit).toUpperCase() : undefined;
  const currency: string = (params.currency || '€').toString();

  // Deterministic-ish mock values
  const base = (hashDeterministic(`${metricNorm}:${year}:${unit ?? ''}`) % 500) + 1500;
  const val = Math.round(base * 100) / 100; // 2dp
  const prev = Math.round(base * 0.88 * 100) / 100;
  const yoyAbs = +(val - prev).toFixed(2);
  const yoyPct = prev ? +(yoyAbs / prev).toFixed(4) : 0;

  const prefix = unit ? `${unit} — ` : '';
  const text = [
    `${prefix}${year} ${metricNorm} snapshot`,
    `- ${currency}${val.toFixed(2)} (prev: ${prev.toFixed(2)})`,
    `- YoY change: ${yoyAbs >= 0 ? '+' : ''}${yoyAbs.toFixed(2)} (${(yoyPct * 100).toFixed(2)}%)`
  ].join('\n');

  return {
    templateOutput: { text, widgets: null },
    kpiSummary: [
      { label: 'Value', value: val },
      { label: 'Prev', value: prev },
      { label: 'YoY Δ', value: yoyAbs },
      { label: 'YoY %', value: +(yoyPct * 100).toFixed(2) },
      { label: 'Currency', value: currency },
    ],
    provenance: {
      source: 'mock',
      tag: 'TEMPLATE_RUN',
      template_id: 'metric_snapshot_year_v1',
      metric: metricNorm,
      year,
      ...(unit ? { unit } : {}),
      currency,
    },
  };
}

export async function runBQ(params: Record<string, any> = {}) {
  const metric: string = (params.metric || 'costs').toString().toLowerCase();
  const metricNorm = metric === 'expenses' ? 'costs' : metric;
  const year: number = (typeof params.year === 'number' && !Number.isNaN(params.year))
    ? params.year
    : (new Date().getFullYear() - 1);
  const unit: string | undefined = params.unit ? String(params.unit).toUpperCase() : undefined;
  const currency: string | undefined = params.currency ? String(params.currency) : undefined;

  const queryParams = { metric: metricNorm, year, ...(unit ? { unit } : {}) } as Record<string, any>;
  const resp = await executeBigQuery('metric_snapshot_year_v1', queryParams);

  if (!resp.success || !resp.rows) {
    const mock = await runMock({ metric: metricNorm, year, unit, currency });
    return {
      ...mock,
      provenance: {
        ...mock.provenance,
        source: 'bq',
        bq: (resp.diagnostics ? { ...resp.diagnostics, rows: Array.isArray(resp.rows) ? resp.rows.length : undefined } : { message: 'No rows' })
      }
    };
  }

  const row = Array.isArray(resp.rows) && resp.rows.length ? resp.rows[0] as any : undefined;
  if (!row) {
    const mock = await runMock({ metric: metricNorm, year, unit, currency });
    return {
      ...mock,
      provenance: {
        ...mock.provenance,
        source: 'bq',
        bq: (resp.diagnostics ? { ...resp.diagnostics, rows: Array.isArray(resp.rows) ? resp.rows.length : undefined } : { message: 'Empty rows' })
      }
    };
  }

  const val = Number(row.value ?? 0);
  const prev = Number(row.prev_value ?? 0);
  const curCurrency = String(currency ?? row.currency ?? '€');
  const yoyAbs = +(val - prev).toFixed(2);
  const yoyPct = prev ? +(yoyAbs / prev).toFixed(4) : 0;

  const prefix = unit ? `${unit} — ` : '';
  const text = [
    `${prefix}${year} ${metricNorm} snapshot`,
    `- ${curCurrency}${val.toFixed(2)} (prev: ${prev.toFixed(2)})`,
    `- YoY change: ${yoyAbs >= 0 ? '+' : ''}${yoyAbs.toFixed(2)} (${(yoyPct * 100).toFixed(2)}%)`
  ].join('\n');

  return {
    templateOutput: { text, widgets: null },
    kpiSummary: [
      { label: 'Value', value: val },
      { label: 'Prev', value: prev },
      { label: 'YoY Δ', value: yoyAbs },
      { label: 'YoY %', value: +(yoyPct * 100).toFixed(2) },
      { label: 'Currency', value: curCurrency },
    ],
    provenance: {
      source: 'bq',
      tag: 'TEMPLATE_RUN',
      template_id: 'metric_snapshot_year_v1',
      metric: metricNorm,
      year,
      ...(unit ? { unit } : {}),
      currency: curCurrency,
      bq: (() => {
        const d: any = resp.diagnostics || {};
        const bq: any = {};
        if (d.jobId) bq.jobId = d.jobId;
        if (typeof d.ms !== 'undefined') bq.ms = d.ms;
        if (typeof d.dataset !== 'undefined') bq.dataset = d.dataset;
        if (typeof d.location !== 'undefined') bq.location = d.location;
        if (typeof d.bytesProcessed !== 'undefined') bq.bytesProcessed = d.bytesProcessed;
        if (typeof d.cacheHit !== 'undefined') bq.cacheHit = d.cacheHit;
        const count = Array.isArray(resp.rows) ? resp.rows.length : undefined;
        if (typeof count !== 'undefined') bq.rows = count;
        return Object.keys(bq).length ? bq : undefined;
      })(),
    },
  };
}
