import fs from "fs";
import path from "path";

type Row = { region: string; gross_2024: number; gross_2025: number };
function pct(curr: number, prev: number) { return prev ? +(((curr - prev) / prev) * 100).toFixed(1) : 0; }

export async function run(params: Record<string, any> = {}) {
  const p = path.join(process.cwd(), "public", "mock-data", "regional_performance.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  const rows: Row[] = raw.regions;

  const enriched = rows.map(r => ({ ...r, yoy_pct: pct(r.gross_2025, r.gross_2024) }))
                      .sort((a,b) => b.yoy_pct - a.yoy_pct);

  const top = enriched[0], bottom = enriched[enriched.length - 1];
  const total24 = rows.reduce((s,r)=>s+r.gross_2024,0);
  const total25 = rows.reduce((s,r)=>s+r.gross_2025,0);
  const overall = pct(total25, total24);

  const kpis = [
    { label: "Overall YoY", value: `${overall}%` },
    { label: "Top Region",  value: `${top.region} (${top.yoy_pct}%)` },
    { label: "Laggard",     value: `${bottom.region} (${bottom.yoy_pct}%)` }
  ];

  const text = `Regional performance (${raw.diagnostics.min_month} → ${raw.diagnostics.max_month}). Overall ${overall}%. `
             + `Top: ${top.region} (${top.yoy_pct}%). Laggard: ${bottom.region} (${bottom.yoy_pct}%).`;

  return {
    text, kpis,
    provenance: { snapshot: raw.snapshot_date, source: "mock", template_id: "regional_performance_v1", filters: params || {} },
    coverage: { time_range: { start: raw.diagnostics.min_month, end: raw.diagnostics.max_month }, diagnostics: raw.diagnostics },
    confidence: "high", mode: "strict"
  };
}
