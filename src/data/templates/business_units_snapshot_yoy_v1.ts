import { executeBigQuery } from '../../services/bigQueryClient.js';

// Expected live row shape from SQL business_units_snapshot_yoy_v1
// Adjust defensively to avoid runtime type errors
 type Row = {
  business_unit?: string;
  revenue_this_year?: number;
  revenue_last_year?: number;
  yoy_growth_pct?: number; // percent
  invoices?: number;       // optional
  ar_days?: number;        // optional
};

export async function runMock(params: Record<string, any> = {}) {
  const unit = String(params.unit || params.bu || 'Z001').toUpperCase();
  const year = typeof params.year === 'number' && !Number.isNaN(params.year)
    ? params.year
    : (new Date().getFullYear() - 1);

  // Deterministic mock values
  const curMEUR = 2.40;
  const prvMEUR = 2.10;
  const yoyPct = +(((curMEUR - prvMEUR) / Math.max(prvMEUR, 1)) * 100).toFixed(1);
  const yoyMEUR = +(curMEUR - prvMEUR).toFixed(2);

  const text = [
    `## ${unit} — ${year} snapshot (YoY)`,
    '',
    `* Revenue (year): €${curMEUR.toFixed(2)}M (prev: €${prvMEUR.toFixed(2)}M)`,
    `* YoY Δ: €${yoyMEUR.toFixed(2)}M (${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%)`,
  ].join('\n');

  return {
    templateOutput: { text, widgets: null },
    kpiSummary: [
      { label: 'Revenue (year)', value: Math.round(curMEUR * 1_000_000) },
      { label: 'YoY Δ %', value: yoyPct },
      { label: 'Invoices', value: 310 },
      { label: 'AR Days', value: 38 },
    ],
    provenance: {
      source: 'mock',
      tag: 'TEMPLATE_RUN',
      template_id: 'business_units_snapshot_yoy_v1',
      unit,
      year,
    },
  };
}

export async function runBQ(params: Record<string, any> = {}) {
  const unit = params.unit || params.bu ? String(params.unit || params.bu).toUpperCase() : undefined;
  const yearFromMonth = params.month ? Number(String(params.month).slice(0, 4)) : undefined;
  const year = typeof params.year === 'number' && !Number.isNaN(params.year)
    ? params.year
    : (typeof yearFromMonth === 'number' && !Number.isNaN(yearFromMonth) ? yearFromMonth : (new Date().getFullYear() - 1));

  const queryParams = unit ? { year, unit } : { year };
  const resp = await executeBigQuery('business_units_snapshot_yoy_v1', queryParams);
  if (!resp.success || !resp.rows) {
    const mock = await runMock({ unit, year });
    return {
      ...mock,
      provenance: { ...mock.provenance, source: 'bq', bq: resp.diagnostics ?? { message: 'No rows' } },
    };
  }

  const rows = (resp.rows as Row[]);
  // Choose specific unit if provided, else pick top by revenue
  let row: Row | undefined;
  if (unit) {
    row = rows.find(r => String(r.business_unit || '').toUpperCase() === unit);
  }
  if (!row) {
    row = [...rows].sort((a, b) => (b.revenue_this_year ?? 0) - (a.revenue_this_year ?? 0))[0];
  }
  if (!row) {
    const mock = await runMock({ unit, year });
    return {
      ...mock,
      provenance: { ...mock.provenance, source: 'bq', bq: resp.diagnostics ?? { message: 'Empty rows' } },
    };
  }

  const cur = Number(row.revenue_this_year ?? 0);
  const prev = Number(row.revenue_last_year ?? 0);
  const yoyPct = Number(
    row.yoy_growth_pct ?? ((cur - prev) / Math.max(prev, 1)) * 100
  );
  const chosenUnit = unit || String(row.business_unit || 'BU');

  const curMEUR = cur / 1_000_000;
  const prvMEUR = prev / 1_000_000;
  const yoyMEUR = curMEUR - prvMEUR;

  const text = [
    `## ${chosenUnit} — ${year} snapshot (YoY)`,
    '',
    `* Revenue (year): €${curMEUR.toFixed(2)}M (prev: €${prvMEUR.toFixed(2)}M)`,
    `* YoY Δ: €${yoyMEUR.toFixed(2)}M (${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%)`,
  ].join('\n');

  const kpis: Array<{ label: string; value: number | string }> = [
    { label: 'Revenue (year)', value: Math.round(cur) },
    { label: 'YoY Δ %', value: +yoyPct.toFixed(1) },
  ];
  if (typeof row.invoices === 'number') kpis.push({ label: 'Invoices', value: row.invoices });
  if (typeof row.ar_days === 'number') kpis.push({ label: 'AR Days', value: row.ar_days });

  return {
    templateOutput: { text, widgets: null },
    kpiSummary: kpis,
    provenance: {
      source: 'bq',
      tag: 'TEMPLATE_RUN',
      template_id: 'business_units_snapshot_yoy_v1',
      unit: chosenUnit,
      year,
      bq: (() => {
        const d: any = (resp.diagnostics as any) || {};
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
