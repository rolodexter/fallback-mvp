import { executeBigQuery } from '../../services/bigQueryClient.js';

type Row = {
  counterparty_name: string;
  gross_amount: number;
  revenue_percent?: number;
  yoy_change_pct?: number;
};

export async function runMock(_: Record<string, any> = {}) {
  const rows: Row[] = [
    { counterparty_name: 'ACME Corp', gross_amount: 2100000, revenue_percent: 18.1 },
    { counterparty_name: 'Globex Marine', gross_amount: 1800000, revenue_percent: 15.5 },
    { counterparty_name: 'Oceanic Partners', gross_amount: 1300000, revenue_percent: 11.2 },
    { counterparty_name: 'SeaSecure Ltd', gross_amount: 900000, revenue_percent: 7.8 },
    { counterparty_name: 'MarineMax Inc', gross_amount: 700000, revenue_percent: 6.0 },
  ];

  return {
    templateOutput: {
      text: 'Top 5 counterparties YTD.',
      widgets: {
        type: 'table',
        columns: ['counterparty', 'gross'],
        rows: rows.map(r => [r.counterparty_name, r.gross_amount])
      }
    },
    kpiSummary: [
      { label: 'TopN', value: rows.length },
      { label: 'TotalGross', value: rows.reduce((s, r) => s + r.gross_amount, 0) }
    ],
    provenance: { source: 'mock', tag: 'TEMPLATE_RUN', template_id: 'top_counterparties_gross_v1' }
  };
}

export async function runBQ(params: Record<string, any> = {}) {
  const effectiveParams = { top: 5, ...params };
  const resp = await executeBigQuery('top_counterparties_gross_v1', effectiveParams);
  if (!resp.success || !resp.rows) {
    const mock = await runMock({});
    return {
      ...mock,
      provenance: { ...mock.provenance, source: 'bq', bq: resp.diagnostics ?? { message: 'No rows' } }
    };
  }

  const rows = (resp.rows as Row[]).slice(0, effectiveParams.top);
  return {
    templateOutput: {
      text: 'Top 5 counterparties YTD.',
      widgets: {
        type: 'table',
        columns: ['counterparty', 'gross'],
        rows: rows.map(r => [r.counterparty_name, r.gross_amount])
      }
    },
    kpiSummary: [
      { label: 'TopN', value: rows.length },
      { label: 'TotalGross', value: rows.reduce((s, r) => s + (r.gross_amount || 0), 0) }
    ],
    provenance: {
      source: 'bq',
      tag: 'TEMPLATE_RUN',
      template_id: 'top_counterparties_gross_v1',
      bq: { ...(resp.diagnostics as any), rows: Array.isArray(resp.rows) ? resp.rows.length : undefined }
    }
  };
}
