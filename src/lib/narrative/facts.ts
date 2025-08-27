// src/lib/narrative/facts.ts

export type FactsPack = {
  period_label: string;                 // e.g., "Sep 2023 → Aug 2025"
  metric?: string;                      // e.g., "gross"
  direction?: "up" | "down" | "flat";
  slope?: number | null;                // optional trend slope
  yoY?: number | null;                  // optional YoY % (if present in tpl)
  topk?: Array<{ name: string; value: number; delta?: number | null }>;
  concentration?: { top1: number; top3: number } | null;   // shares (0..1) if derivable
  coverage: { rows: number; window: string };
  unit?: string;                        // BU code or "ALL"
};

// ---- helpers (pure; no model calls) ----
function pick<T>(v: T | undefined | null, fallback: T): T {
  return (v === undefined || v === null) ? fallback : v;
}

function toNum(x: any): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const s = x.replace(/[, ]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function guessNameAndValueKeys(row: Record<string, any>) {
  const keys = Object.keys(row);
  // heuristic: prefer common pairs
  const nameKey = keys.find(k => /^(name|counterparty|unit|bu|label|category)$/i.test(k))
              ?? keys.find(k => typeof row[k] === "string");
  // pick the largest numeric field as value
  let valueKey: string | undefined;
  let best = -Infinity;
  for (const k of keys) {
    const v = toNum(row[k]);
    if (v !== null && v > best) { best = v; valueKey = k; }
  }
  return { nameKey, valueKey };
}

function extractTopKFromRows(rows: any[], k = 5) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const { nameKey, valueKey } = guessNameAndValueKeys(rows[0] ?? {});
  if (!nameKey || !valueKey) return [];
  const cleaned = rows
    .map(r => ({ name: String(r[nameKey]), value: toNum(r[valueKey]) }))
    .filter(r => typeof r.name === "string" && r.value !== null) as {name: string; value: number}[];
  cleaned.sort((a,b) => b.value - a.value);
  return cleaned.slice(0, k);
}

function totalFromRows(rows: any[]) {
  const vals: number[] = [];
  for (const r of rows ?? []) {
    const { valueKey } = guessNameAndValueKeys(r ?? {});
    const v = toNum(valueKey ? r[valueKey] : undefined);
    if (v !== null) vals.push(v);
  }
  return vals.reduce((a, b) => a + b, 0);
}

function makePeriodLabel(tpl: any, params: any): string {
  // prefer explicit template/meta hints, else params, else generic
  const m = tpl?.meta ?? {};
  if (m.period_label) return String(m.period_label);
  if (params?.from && params?.to) return `${params.from} → ${params.to}`;
  if (params?.year) return String(params.year);
  const d = m?.defaults_used?.period ?? "last_12m";
  return d === "last_12m" ? "last 12 complete months" : String(d);
}

function inferDirection(tpl: any): "up" | "down" | "flat" {
  const slope = toNum(tpl?.meta?.trend?.slope);
  if (slope !== null && Math.abs(slope) > 1e-12) return slope > 0 ? "up" : "down";
  const dir = tpl?.kpiSummary?.direction ?? tpl?.meta?.direction;
  if (dir === "up" || dir === "down" || dir === "flat") return dir;
  return "flat";
}

// ---- main builder ----
export function buildFactsPack(tpl: any, params: any): FactsPack {
  const rows = Array.isArray(tpl?.rows) ? tpl.rows : Array.isArray(tpl?.data) ? tpl.data : [];
  const topk = extractTopKFromRows(rows);

  // concentration if we can derive from the same rows (pure arithmetic; no new external facts)
  let concentration: FactsPack["concentration"] = null;
  if (topk.length > 0) {
    const grand = totalFromRows(rows);
    if (grand > 0) {
      const top1 = topk[0]?.value ?? 0;
      const top3 = topk.slice(0,3).reduce((a, b) => a + (b?.value ?? 0), 0);
      concentration = { top1: top1 / grand, top3: top3 / grand };
    }
  }

  const f: FactsPack = {
    period_label: makePeriodLabel(tpl, params),
    metric: tpl?.meta?.metric ?? params?.metric ?? "gross",
    direction: inferDirection(tpl),
    slope: toNum(tpl?.meta?.trend?.slope),
    yoY: toNum(tpl?.meta?.kpis?.yoy ?? tpl?.kpiSummary?.yoy),
    topk,
    concentration,
    coverage: {
      rows: rows.length,
      window: tpl?.meta?.defaults_used?.period ?? "last_12m",
    },
    unit: params?.unit ?? tpl?.meta?.unit ?? "ALL",
  };
  return f;
}
