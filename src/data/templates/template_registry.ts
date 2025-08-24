// Generated from template_registry.json to avoid JSON import issues in serverless bundling
// Exported as a TypeScript module for safer Vercel runtime

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
