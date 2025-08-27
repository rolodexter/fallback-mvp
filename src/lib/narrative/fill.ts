// src/lib/narrative/fill.ts
import type { FactsPack } from "./facts";

export function fillPlaceholders(skel: string, f: FactsPack): string {
  const dict: Record<string, string> = {
    "{metric}": f.metric ?? "metric",
    "{period_label}": f.period_label,
    "{direction}": f.direction ?? "flat",
    "{yoY}": f.yoY == null ? "n/a" : pct(f.yoY),
    "{topk[0].name}": f.topk?.[0]?.name ?? "n/a",
    "{topk[0].value}": f.topk?.[0]?.value != null ? fmtNum(f.topk[0].value) : "n/a",
    "{concentration.top3}": f.concentration?.top3 != null ? pct(f.concentration.top3) : "n/a",
  };
  let out = skel;
  for (const [k, v] of Object.entries(dict)) out = out.split(k).join(v);
  return out;
}

// Extract numeric tokens in a string.
function extractNumbers(text: string): string[] {
  const m = text.match(/[-+]?\d[\d,]*(?:\.\d+)?%/g) || [];
  const m2 = text.match(/[-+]?\d[\d,]*(?:\.\d+)?/g) || [];
  return Array.from(new Set([...m, ...m2]));
}

function whitelistFromFacts(f: FactsPack): Set<string> {
  const s = new Set<string>();
  const push = (x?: number | null) => {
    if (x == null) return;
    s.add(fmtNum(x));
    s.add(String(x));
    // percent encodings
    const p = Math.abs(x) <= 1 ? x * 100 : x;
    s.add(`${Number(p).toFixed(2)}%`);
    s.add(`${Math.round(p)}%`);
  };
  push(f.yoY ?? null);
  push(f.slope ?? null);
  if (f.concentration?.top1 != null) push(f.concentration.top1);
  if (f.concentration?.top3 != null) push(f.concentration.top3);
  for (const r of f.topk ?? []) push(r.value);
  // Also allow numbers that appear inside the period label (years)
  for (const y of (f.period_label.match(/\d{4}/g) || [])) s.add(y);
  return s;
}

/** Returns true if no new numbers were introduced (i.e., every number in text is whitelisted). */
export function guardNoNewNumbers(text: string, f: FactsPack): boolean {
  const nums = extractNumbers(text);
  if (!nums.length) return true;
  const wl = whitelistFromFacts(f);
  return nums.every(n => wl.has(n));
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}
function pct(p: number): string {
  const val = Math.abs(p) <= 1 ? p * 100 : p;
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(val).toFixed(2)}%`;
}
