import fs from "fs";
import path from "path";
function pct(n: number, d: number) { return d ? +((n/d)*100).toFixed(1) : 0; }

export async function run(params: Record<string, any> = {}) {
  const p = path.join(process.cwd(), "public", "mock-data", "profitability_summary.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));

  const marginPct = pct(raw.summary.margin, raw.summary.revenue);
  const units = raw.units.map((u: any) => ({ ...u, margin_pct: pct(u.margin, u.revenue) }))
                         .sort((a:any,b:any)=> b.margin_pct - a.margin_pct);
  const top = units[0], bottom = units[units.length-1];

  const kpis = [
    { label: "Revenue", value: `$${raw.summary.revenue.toLocaleString()}` },
    { label: "Margin",  value: `$${raw.summary.margin.toLocaleString()} (${marginPct}%)` },
    { label: "Top BU (margin%)", value: `${top.bu} (${top.margin_pct}%)` },
    { label: "Bottom BU (margin%)", value: `${bottom.bu} (${bottom.margin_pct}%)` }
  ];

  const text = `Profitability (${raw.diagnostics.min_month} → ${raw.diagnostics.max_month}). `
             + `Revenue $${raw.summary.revenue.toLocaleString()}, Margin $${raw.summary.margin.toLocaleString()} (${marginPct}%). `
             + `Best: ${top.bu} (${top.margin_pct}%). Weakest: ${bottom.bu} (${bottom.margin_pct}%).`;

  return {
    text, kpis,
    provenance: { snapshot: raw.snapshot_date, source: "mock", template_id: "profitability_summary_v1", filters: params || {} },
    coverage: { time_range: { start: raw.diagnostics.min_month, end: raw.diagnostics.max_month }, diagnostics: raw.diagnostics },
    confidence: "high", mode: "strict"
  };
}
