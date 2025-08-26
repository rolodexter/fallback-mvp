// ESM-only imports
import { executeBigQuery } from "../../services/bigQueryClient.js";

type Kpi = { label: string; value: number; unit?: string };

type CoverageInfo = {
  shown: number;        // How many BUs we're displaying
  total: number;        // Total BUs available
  dataset?: string;     // Source dataset
  location?: string;    // Region/location
  last_refresh?: string; // When the dimension was last refreshed
  facts_count?: number;  // Optional count from facts table
};

type PagingInfo = {
  next_page_token?: string; // Token for fetching the next page
  page_size: number;        // Items per page
  current_page: number;     // Current page number (1-based)
};

enum SourceTag {
  TemplateRun = "TEMPLATE_RUN",
  BQErrorFallback = "BQ_ERROR_FALLBACK",
  CoverageNote = "COVERAGE_NOTE",
}

function fmt(list: string[]) {
  return list.length ? list.join(", ") : "None found.";
}

// Get default page size from env or use fallback
function getPageSize(): number {
  try {
    const envLimit = process.env.BU_LIST_LIMIT;
    if (envLimit) {
      const parsed = parseInt(envLimit, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return 8; // Default page size if not specified
}

// Create coverage message based on shown/total counts
function coverageMessage(shown: number, total: number, factsCount?: number): string {
  let msg = `Found ${total} business unit${total !== 1 ? 's' : ''}; showing ${shown}.`;
  
  // Add optional facts coverage note
  if (typeof factsCount === 'number' && factsCount < total) {
    msg += ` Data coverage note: ${total} BUs exist in the catalog; ${factsCount} appear in facts.`;
  }
  
  return msg;
}

export async function runMock(params: Record<string, any> = {}) {
  // All available business units in the mock dataset
  const allUnits = ["Z001", "Z002", "Z003", "Z004", "Z005", "Z006", "Z007", "Z008", "Z009", "Z010", "Z011", "Z012"];
  const total = allUnits.length;
  
  // Support pagination
  const pageSize = getPageSize();
  const pageToken = params.page_token ? String(params.page_token) : '';
  const startIndex = pageToken ? parseInt(pageToken, 10) : 0;
  
  // Apply limit and pagination
  const limit = params.limit ? Math.min(parseInt(String(params.limit), 10), total) : pageSize;
  const endIndex = Math.min(startIndex + limit, total);
  const units = allUnits.slice(startIndex, endIndex);
  const shown = units.length;
  
  // Create paging info if there are more results
  let paging: PagingInfo | undefined;
  if (endIndex < total) {
    paging = {
      next_page_token: String(endIndex),
      page_size: pageSize,
      current_page: Math.floor(startIndex / pageSize) + 1
    };
  }
  
  // Coverage information
  const coverage: CoverageInfo = {
    shown,
    total,
    dataset: "mock_dim_business_units",
    location: "US",
    last_refresh: new Date().toISOString().split('T')[0]
  };
  
  // Optional facts coverage simulation (some BUs might not appear in facts)
  const factsCount = Math.floor(total * 0.8); // Simulate 80% coverage in facts table
  coverage.facts_count = factsCount;
  
  // Create text with coverage information
  const text = coverageMessage(shown, total, factsCount);
  const kpiSummary: Kpi[] = [{ label: "Units", value: total }];

  return {
    templateOutput: { 
      text, 
      widgets: { type: "list", items: units } 
    },
    kpiSummary,
    meta: { coverage },
    paging,
    provenance: {
      source: "mock",
      tag: SourceTag.CoverageNote,
      template_id: "business_units_list_v1",
      domain: "business_units",
      confidence: 1,
    },
  };
}

// Optional live path — will work if you add a SQL later.
// For now it gracefully falls back to mock if no rows are returned.
export async function runBQ(params: Record<string, any> = {}) {
  try {
    // Set BU dimension table from env or use default
    const dimTable = process.env.BU_DIM_TABLE || "business_units";
    const { rows, diagnostics } = await executeBigQuery("business_units_list_v1", { dim_table: dimTable } as any);
    
    // Extract all unique business unit codes from the result
    const allUnits = Array.from(
      new Set((rows ?? []).map((r: any) => r.bu_code || r.unit || r.code))
    ).filter(Boolean) as string[];
    
    const total = allUnits.length || 0;
    
    // Get fact table coverage if configured
    let factsCount: number | undefined;
    if (process.env.BU_FACT_TABLE && process.env.BU_FACT_WINDOW_MONTHS) {
      try {
        const factParams = {
          fact_table: process.env.BU_FACT_TABLE,
          months: parseInt(process.env.BU_FACT_WINDOW_MONTHS, 10) || 12
        };
        const factResult = await executeBigQuery("business_units_fact_coverage", factParams as any);
        factsCount = (factResult.rows?.[0]?.count as number) || 0;
      } catch {
        // Silently continue if fact coverage query fails
      }
    }
    
    // Support pagination
    const pageSize = getPageSize();
    const pageToken = params.page_token ? String(params.page_token) : '';
    const startIndex = pageToken ? parseInt(pageToken, 10) : 0;
    
    // Apply limit and pagination
    const limit = params.limit ? Math.min(parseInt(String(params.limit), 10), total) : pageSize;
    const endIndex = Math.min(startIndex + limit, total);
    const units = allUnits.slice(startIndex, endIndex);
    const shown = units.length;
    
    // Create paging info if there are more results
    let paging: PagingInfo | undefined;
    if (endIndex < total) {
      paging = {
        next_page_token: String(endIndex),
        page_size: pageSize,
        current_page: Math.floor(startIndex / pageSize) + 1
      };
    }
    
    // Coverage information
    const coverage: CoverageInfo = {
      shown,
      total,
      dataset: (diagnostics as any)?.dataset,
      location: (diagnostics as any)?.location,
      last_refresh: new Date().toISOString().split('T')[0],
      facts_count: factsCount
    };
    
    // Create text with coverage information
    const text = coverageMessage(shown, total, factsCount);
    const kpiSummary: Kpi[] = [{ label: "Units", value: total }];

    return {
      templateOutput: { text, widgets: { type: "list", items: units } },
      kpiSummary,
      meta: { coverage },
      paging,
      provenance: {
        source: "bq",
        tag: SourceTag.CoverageNote,
        template_id: "business_units_list_v1",
        domain: "business_units",
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
    // Never fail Stage-A: fall back to mock, keep a diagnostic tag
    const mock: any = await runMock(params);
    mock.provenance = { ...(mock.provenance ?? {}), tag: SourceTag.BQErrorFallback };
    return mock;
  }
}
