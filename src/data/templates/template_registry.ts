// Generated from template_registry.json to avoid JSON import issues in serverless bundling
// Exported as a TypeScript module for safer Vercel runtime

import * as monthlyGrossTrendV1 from './monthly_gross_trend_v1.js';
import * as topCounterpartiesGrossV1 from './top_counterparties_gross_v1.js';
import * as businessUnitsSnapshotYoYV1 from './business_units_snapshot_yoy_v1.js';
import * as businessUnitsListV1 from './business_units_list_v1.js';
import * as metricSnapshotYearV1 from './metric_snapshot_year_v1.js';
import * as metricTimeseriesV1 from './metric_timeseries_v1.js';
import * as metricBreakdownByUnitV1 from './metric_breakdown_by_unit_v1.js';

const templateRegistry = {
  business_units: {
    schemaId: "bu_v1",
    summaryFn: "performanceSummary",
    groundingNarrativeId: "business_units_intro",
    templateId: "business_units_snapshot_yoy_v1",
  },
  performance: {
    schemaId: "perf_v1",
    summaryFn: "performanceSummary",
    groundingNarrativeId: "performance_intro",
    templateId: "monthly_gross_trend_v1",
  },
  counterparties: {
    schemaId: "cp_v1",
    summaryFn: "counterpartySummary",
    groundingNarrativeId: "counterparty_intro",
    templateId: "top_counterparties_gross_v1",
  },
  risk: {
    schemaId: "risk_v1",
    summaryFn: "riskSummary",
    groundingNarrativeId: "risk_intro",
  },
  profitability: {
    schemaId: "profit_v1",
    summaryFn: "profitabilitySummary",
    groundingNarrativeId: "profitability_intro",
    templateId: "profitability_summary_v1",
  },
  regional: {
    schemaId: "region_v1",
    summaryFn: "regionalSummary",
    groundingNarrativeId: "regional_intro",
    templateId: "regional_performance_v1",
  },
} as const;

export default templateRegistry;

// Map concrete template IDs to runnable module functions (runMock/runBQ)
// Note: Consumers can choose which to call based on DATA_MODE/live
export const templateRunners = {
  business_units_snapshot_yoy_v1: businessUnitsSnapshotYoYV1,
  monthly_gross_trend_v1: monthlyGrossTrendV1,
  top_counterparties_gross_v1: topCounterpartiesGrossV1,
  business_units_list_v1: businessUnitsListV1,
  metric_snapshot_year_v1: metricSnapshotYearV1,
  metric_timeseries_v1: metricTimeseriesV1,
  metric_breakdown_by_unit_v1: metricBreakdownByUnitV1,
} as const;
