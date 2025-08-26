import { executeBigQuery } from '../../services/bigQueryClient.js';

// id: metric_timeseries_v1
// domain: metrics
// Params: { metric: 'costs'|'revenue'|'gross'|'expenses'; from: string; to: string; granularity: 'month'|'quarter'|'year'; unit?: string|null; currency?: string|null }

type Point = { x: string; y: number };

function hashDeterministic(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function genRange(from: string, to: string, granularity: 'month'|'quarter'|'year'): string[] {
  // parse simplistic: assume from/to like YYYY or YYYY-MM
  const parse = (s: string) => {
    const [Y, M] = s.split('-').map(Number);
    return { Y, M: M || 1 };
  };
  const a = parse(from);
  const b = parse(to);
  const out: string[] = [];
  if (granularity === 'year') {
    for (let y = a.Y; y <= b.Y; y++) out.push(String(y));
    return out;
  }
  if (granularity === 'quarter') {
    let y = a.Y, m = a.M;
    while (y < b.Y || (y === b.Y && m <= (b.M || 12))) {
      const q = Math.floor((m - 1) / 3) + 1;
      out.push(`${y}-Q${q}`);
      m += 3;
      if (m > 12) { m -= 12; y += 1; }
    }
    return Array.from(new Set(out));
  }
  // month
  let y = a.Y, m = a.M;
  while (y < b.Y || (y === b.Y && m <= (b.M || 12))) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export async function runMock(params: Record<string, any> = {}) {
  const metric: string = (params.metric || 'costs').toString().toLowerCase();
  const metricNorm = metric === 'expenses' ? 'costs' : metric;
  const from: string = String(params.from || '2020-01');
  const to: string = String(params.to || new Date().toISOString().slice(0, 7));
  const granularity: 'month'|'quarter'|'year' = (params.granularity === 'quarter' || params.granularity === 'year') ? params.granularity : 'month';
  const unit: string | undefined = params.unit ? String(params.unit).toUpperCase() : undefined;
  const currency: string = (params.currency || '€').toString();

  const labels = genRange(from, to, granularity);
  const seed = hashDeterministic(`${metricNorm}:${from}:${to}:${granularity}:${unit ?? ''}`) % 1000;
  const base = 1000 + (seed % 400);
  const series: Point[] = labels.map((lab, idx) => ({ x: lab, y: Math.round((base + idx * ((seed % 13) - 6)) * 100) / 100 }));

  const slope = series.length > 1 ? (series[series.length - 1].y - series[0].y) / (series.length - 1) : 0;
  const min = series.reduce((a, b) => (b.y < a.y ? b : a));
  const max = series.reduce((a, b) => (b.y > a.y ? b : a));

  const prefix = unit ? `${unit} — ` : '';
  const text = [
    `${prefix}${metricNorm} ${granularity} trend ${from}→${to}`,
    `- slope: ${slope >= 0 ? 'up' : 'down'} (${slope.toFixed(2)})`,
    `- min/max: ${min.x} / ${max.x}`
  ].join('\n');

  return {
    templateOutput: { text, widgets: { type: 'line', series: [{ name: metricNorm, data: series }] } },
    kpiSummary: [
      { label: 'Slope', value: +slope.toFixed(2) },
      { label: 'Min', value: `${min.x}` },
      { label: 'Max', value: `${max.x}` },
      { label: 'Currency', value: currency },
    ],
    provenance: {
      source: 'mock',
      tag: 'TEMPLATE_RUN',
      template_id: 'metric_timeseries_v1',
      metric: metricNorm,
      from, to, granularity,
      ...(unit ? { unit } : {}),
      currency,
    },
  };
}

export async function runBQ(params: Record<string, any> = {}) {
  const metric: string = (params.metric || 'costs').toString().toLowerCase();
  const metricNorm = metric === 'expenses' ? 'costs' : metric;
  const from: string = String(params.from || '2020-01');
  const to: string = String(params.to || new Date().toISOString().slice(0, 7));
  const granularity: 'month'|'quarter'|'year' = (params.granularity === 'quarter' || params.granularity === 'year') ? params.granularity : 'month';
  const unit: string | undefined = params.unit ? String(params.unit).toUpperCase() : undefined;
  const currency: string | undefined = params.currency ? String(params.currency) : undefined;

  const queryParams = { metric: metricNorm, from, to, granularity, ...(unit ? { unit } : {}) } as Record<string, any>;
  const resp = await executeBigQuery('metric_timeseries_v1', queryParams);

  if (!resp.success || !resp.rows) {
    const mock = await runMock({ metric: metricNorm, from, to, granularity, unit, currency });
    return {
      ...mock,
      provenance: {
        ...mock.provenance,
        source: 'bq',
        bq: (resp.diagnostics ? { ...resp.diagnostics, rows: Array.isArray(resp.rows) ? resp.rows.length : undefined } : { message: 'No rows' })
      }
    };
  }

  const rows: Array<{ period: string; value: number }> = (resp.rows as any[]) || [];
  const series: Point[] = rows.map(r => ({ x: String(r.period), y: Number(r.value ?? 0) }));
  const slope = series.length > 1 ? (series[series.length - 1].y - series[0].y) / (series.length - 1) : 0;
  const min = series.reduce((a, b) => (b.y < a.y ? b : a), series[0] || { x: '', y: 0 });
  const max = series.reduce((a, b) => (b.y > a.y ? b : a), series[0] || { x: '', y: 0 });
  const curCurrency = String(currency ?? '€');

  const prefix = unit ? `${unit} — ` : '';
  const text = [
    `${prefix}${metricNorm} ${granularity} trend ${from}→${to}`,
    `- slope: ${slope >= 0 ? 'up' : 'down'} (${slope.toFixed(2)})`,
    `- min/max: ${min?.x ?? '—'} / ${max?.x ?? '—'}`
  ].join('\n');

  return {
    templateOutput: { text, widgets: { type: 'line', series: [{ name: metricNorm, data: series }] } },
    kpiSummary: [
      { label: 'Slope', value: +slope.toFixed(2) },
      { label: 'Min', value: `${min?.x ?? ''}` },
      { label: 'Max', value: `${max?.x ?? ''}` },
      { label: 'Currency', value: curCurrency },
    ],
    provenance: {
      source: 'bq',
      tag: 'TEMPLATE_RUN',
      template_id: 'metric_timeseries_v1',
      metric: metricNorm,
      from, to, granularity,
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
