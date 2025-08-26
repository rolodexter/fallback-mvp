// ESM-only imports
import { executeBigQuery } from "../../services/bigQueryClient.js";
import { unitLabel } from "../../data/labels.js";

type Kpi = { label: string; value: number; unit?: string };

// Period parameter type for documentation purposes
// Used as reference for params.period structure
/**
interface PeriodParam {
  year?: number;
  month?: number;
  from?: { year: number; month: number };
  to?: { year: number; month: number };
}
*/

type MetricBreakdownItem = {
  bu_code: string;
  bu_name: string;
  value: number;
  share: number;
};

// Format numbers for display
const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `€${(value / 1000).toFixed(0)}K`;
  }
  return `€${value.toFixed(0)}`;
};

// Format percentage values
const formatPercent = (value: number): string => {
  return `${(value * 100).toFixed(0)}%`;
};

// Create table rows from breakdown items
const createTableRows = (items: MetricBreakdownItem[]): Array<Array<string>> => {
  return items.map(item => [
    unitLabel(item.bu_code), // Use friendly labels
    formatCurrency(item.value),
    formatPercent(item.share)
  ]);
};

// Generate metric period description
const getPeriodDescription = (params: Record<string, any>): string => {
  const period = params.period || {};

  if (period.last_12m || params.period === 'last_12m') {
    return 'Last 12 Months';
  }
  
  if (period.year) {
    return `FY ${period.year}`;
  }
  
  if (period.month && period.year) {
    const date = new Date(period.year, period.month - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  
  return 'Last 12 Months'; // Default
};

// Get proper metric expression for SQL
const getMetricExpression = (metric: string): string => {
  switch (metric?.toLowerCase()) {
    case 'revenue':
      return 'f.CGBWH_REVENUE';
    case 'gross':
      return 'f.CGBWH_GROSS';
    case 'costs':
      return 'f.CGBWH_COSTS';
    default:
      return 'f.CGBWH_REVENUE'; // Default to revenue
  }
};

// Get human-friendly metric name
const getMetricName = (metric: string): string => {
  switch (metric?.toLowerCase()) {
    case 'revenue':
      return 'Revenue';
    case 'gross':
      return 'Gross';
    case 'costs':
      return 'Costs';
    default:
      return 'Revenue';
  }
};

export async function runMock(params: Record<string, any> = {}) {
  // Sample data for mock mode
  const metric = params.metric || 'revenue';
  const metricName = getMetricName(metric);
  const periodDesc = getPeriodDescription(params);
  
  // All available business units in the mock dataset
  const allUnits = [
    { bu_code: "Z001", bu_name: "Liferafts", value: 1200000, share: 0.32 },
    { bu_code: "Z002", bu_name: "Marine Safety", value: 950000, share: 0.25 },
    { bu_code: "Z003", bu_name: "Navigation Systems", value: 750000, share: 0.20 },
    { bu_code: "Z004", bu_name: "Commercial Vessels", value: 350000, share: 0.09 },
    { bu_code: "Z005", bu_name: "Port Services", value: 250000, share: 0.07 },
    { bu_code: "Z006", bu_name: "Maritime Tech", value: 150000, share: 0.04 },
    { bu_code: "Z007", bu_name: "Fleet Management", value: 75000, share: 0.02 },
    { bu_code: "Z008", bu_name: "Offshore Solutions", value: 50000, share: 0.01 }
  ];
  
  // Apply limit for 'top' parameter
  const top = params.top === 'all' ? allUnits.length : (parseInt(params.top as string, 10) || 8);
  const items = allUnits.slice(0, Math.min(top, allUnits.length));
  const total = allUnits.length;
  const shown = items.length;
  
  // Create table columns and rows
  const columns = ['Business Unit', metricName, 'Share'];
  const tableRows = createTableRows(items);
  
  // Track if default limit was used
  const defaultsUsed = {
    ...(params.top !== 'all' && top === 8 ? { top: 8 } : {}),
    ...(params.metric ? {} : { metric: 'revenue' }),
    ...(params.period ? {} : { period: 'last_12m' })
  };
  
  // Create coverage info
  const coverage = { shown, total };
  
  // Create heading and summary text
  const title = `${metricName} by Business Unit — ${periodDesc}`;
  const summaryText = `${metricName} breakdown across business units for ${periodDesc}. ` +
    `Showing ${shown} of ${total} business units.`;
  
  // Create KPI summary
  const kpiSummary: Kpi[] = [{ label: metricName, value: allUnits.reduce((sum, item) => sum + item.value, 0) }];
  
  // Set assumptions if unit parameter is not explicit
  const assumptions = params.unit ? {} : { unit: "ALL" };
  
  return {
    templateOutput: {
      text: summaryText,
      title,
      widgets: [
        { 
          type: "table", 
          columns, 
          rows: tableRows 
        }
      ]
    },
    kpiSummary,
    meta: { 
      coverage,
      defaults_used: Object.keys(defaultsUsed).length ? defaultsUsed : undefined,
      assumptions: Object.keys(assumptions).length ? assumptions : undefined
    },
    provenance: {
      source: "mock",
      template_id: "metric_breakdown_by_unit_v1",
      domain: "metrics",
      confidence: 1,
    },
  };
}

export async function runBQ(params: Record<string, any> = {}) {
  try {
    // Set parameters
    const metric = params.metric || 'revenue';
    const metricName = getMetricName(metric);
    const metricExpr = getMetricExpression(metric);
    const periodDesc = getPeriodDescription(params);
    
    // Get fact table from env or use default
    const factTable = process.env.BU_FACT_TABLE || "riskiII.Base_IDP_20250816.CGBWH";
    const dimTable = process.env.BU_DIM_TABLE || "riskiII.Base_IDP_20250816.dim_company_map";
    
    // Prepare SQL parameters
    const sqlParams = {
      metric_expr: metricExpr,
      fact_table: factTable,
      dim_table: dimTable,
      top: params.top === 'all' ? 100 : (parseInt(params.top as string, 10) || 8)
    };
    
    // Execute BigQuery
    const { rows, diagnostics } = await executeBigQuery("metric_breakdown_by_unit_v1", sqlParams as any);
    
    if (!rows || !rows.length) {
      console.warn('No data returned from BQ for metric breakdown');
      // Fall back to mock if no data
      return runMock(params);
    }
    
    // Process the data
    const items = rows.map((row: any) => ({
      bu_code: row.bu_code,
      bu_name: row.bu_name,
      value: parseFloat(row.value) || 0,
      share: parseFloat(row.share) || 0
    }));
    
    const total = rows[0]?.total_count || items.length;
    const shown = items.length;
    
    // Create table columns and rows
    const columns = ['Business Unit', metricName, 'Share'];
    const tableRows = createTableRows(items);
    
    // Track if default limit was used
    const defaultsUsed = {
      ...(params.top !== 'all' && sqlParams.top === 8 ? { top: 8 } : {}),
      ...(params.metric ? {} : { metric: 'revenue' }),
      ...(params.period ? {} : { period: 'last_12m' })
    };
    
    // Create coverage info
    const coverage = { shown, total };
    
    // Create heading and summary text
    const title = `${metricName} by Business Unit — ${periodDesc}`;
    const summaryText = `${metricName} breakdown across business units for ${periodDesc}. ` +
      `Showing ${shown} of ${total} business units.`;
    
    // Create KPI summary
    const kpiSummary: Kpi[] = [{ label: metricName, value: items.reduce((sum, item) => sum + item.value, 0) }];
    
    // Set assumptions if unit parameter is not explicit
    const assumptions = params.unit ? {} : { unit: "ALL" };
    
    return {
      templateOutput: {
        text: summaryText,
        title,
        widgets: [
          { 
            type: "table", 
            columns, 
            rows: tableRows 
          }
        ]
      },
      kpiSummary,
      meta: { 
        coverage,
        defaults_used: Object.keys(defaultsUsed).length ? defaultsUsed : undefined,
        assumptions: Object.keys(assumptions).length ? assumptions : undefined
      },
      provenance: {
        source: "bq",
        template_id: "metric_breakdown_by_unit_v1",
        domain: "metrics",
        bq: {
          ms: (diagnostics as any)?.ms,
          jobId: (diagnostics as any)?.jobId,
          rows: (diagnostics as any)?.rows,
          dataset: (diagnostics as any)?.dataset,
          location: (diagnostics as any)?.location,
        },
      },
    };
  } catch (e) {
    console.warn('Error executing BQ for metric breakdown:', e);
    // Fall back to mock on error
    const mock: any = await runMock(params);
    mock.provenance = { ...(mock.provenance || {}), tag: "BQ_ERROR_FALLBACK" };
    return mock;
  }
}
