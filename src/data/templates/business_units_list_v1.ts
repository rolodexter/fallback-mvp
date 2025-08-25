// ESM-only imports
import { executeBigQuery } from "../../services/bigQueryClient.js";

type Kpi = { label: string; value: number; unit?: string };

enum SourceTag {
  TemplateRun = "TEMPLATE_RUN",
  BQErrorFallback = "BQ_ERROR_FALLBACK",
}

function fmt(list: string[]) {
  return list.length ? list.join(", ") : "None found.";
}

export async function runMock(_: Record<string, any> = {}) {
  const units = ["Z001", "Z002", "Z003", "Z004", "Z005"];
  const text = `Business units (${units.length}): ${fmt(units)}`;
  const kpiSummary: Kpi[] = [{ label: "Units", value: units.length }];

  return {
    templateOutput: { text, widgets: { type: "list", items: units } },
    kpiSummary,
    provenance: {
      source: "mock",
      tag: SourceTag.TemplateRun,
      template_id: "business_units_list_v1",
      domain: "business_units",
      confidence: 1,
    },
  };
}

// Optional live path — will work if you add a SQL later.
// For now it gracefully falls back to mock if no rows are returned.
export async function runBQ(_: Record<string, any> = {}) {
  try {
    const { rows, diagnostics } = await executeBigQuery("business_units_list_v1", {} as any);
    const units = Array.from(
      new Set((rows ?? []).map((r: any) => r.bu_code || r.unit || r.code))
    ).filter(Boolean) as string[];

    const text = `Business units (${units.length}): ${fmt(units)}`;
    const kpiSummary: Kpi[] = [{ label: "Units", value: units.length }];

    return {
      templateOutput: { text, widgets: { type: "list", items: units } },
      kpiSummary,
      provenance: {
        source: "bq",
        tag: SourceTag.TemplateRun,
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
    const mock: any = await runMock();
    mock.provenance = { ...(mock.provenance ?? {}), tag: SourceTag.BQErrorFallback };
    return mock;
  }
}
