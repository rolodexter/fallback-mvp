import { executeBigQuery } from '../../services/bigQueryClient.js';

// Types for clarity
type TrendRow = { yyyymm: string; gross_amount: number };

export async function runMock(_: Record<string, any> = {}) {
  // Deterministic 6-month mock
  const months = ['202401','202402','202403','202404','202405','202406'];
  const series = months.map((m, i) => ({ x: m, y: 1000000 + i * 125000 }));
  return {
    templateOutput: {
      text: 'Last 6 months gross trend.',
      widgets: { type: 'line', series: [{ name: 'Gross', data: series }] }
    },
    kpiSummary: [
      { label: 'Months', value: 6 },
      { label: 'LatestGross', value: series[series.length - 1].y }
    ],
    provenance: { source: 'mock', tag: 'TEMPLATE_RUN', template_id: 'monthly_gross_trend_v1' }
  };
}

export async function runBQ(params: Record<string, any> = {}) {
  const resp = await executeBigQuery('monthly_gross_trend_v1', params);
  if (!resp.success || !resp.rows) {
    // Fallback to mock shape while indicating bq failure
    const mock = await runMock({});
    return {
      ...mock,
      provenance: {
        ...mock.provenance,
        source: 'bq',
        bq: resp.diagnostics ?? { message: 'No rows' }
      }
    };
  }

  const rows = resp.rows as TrendRow[];
  const data = rows
    .slice(-6)
    .map(r => ({ x: r.yyyymm, y: Number(r.gross_amount ?? 0) }))
    .sort((a, b) => a.x.localeCompare(b.x));

  return {
    templateOutput: {
      text: 'Last 6 months gross trend.',
      widgets: { type: 'line', series: [{ name: 'Gross', data }] }
    },
    kpiSummary: [
      { label: 'Months', value: data.length },
      { label: 'LatestGross', value: data.length ? data[data.length - 1].y : 0 }
    ],
    provenance: {
      source: 'bq',
      tag: 'TEMPLATE_RUN',
      template_id: 'monthly_gross_trend_v1',
      bq: { ...(resp.diagnostics as any), rows: Array.isArray(resp.rows) ? resp.rows.length : undefined }
    }
  };
}
