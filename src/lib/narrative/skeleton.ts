// src/lib/narrative/skeleton.ts
import type { FactsPack } from "./facts";

export function draftSkeleton(f: FactsPack): string {
  const dir = f.direction === "up" ? "Up" : f.direction === "down" ? "Down" : "Flat";
  const top1 = f.topk?.[0]?.name ? `${f.topk[0].name} at ${fmtNum(f.topk[0].value)}` : "No clear leader";
  const cTop3 = f.concentration?.top3 != null ? pct(f.concentration.top3) : "n/a";

  return [
    `HEADLINE: ${f.metric ?? "metric"} ${dir}${f.yoY != null ? ` (${pct(f.yoY) } YoY)` : ""} — ${f.period_label}`,
    ``,
    `BULLETS:`,
    `- So-what: ${f.metric ?? "metric"} shows ${f.direction} trend; concentration(top-3): ${cTop3}.`,
    `- Driver: ${top1}.`,
    `- Risk/Opportunity: Consider pricing or mix actions on top contributors.`,
    ``,
    `ACTIONS:`,
    `1) Quantify sensitivity on top-2 contributors (±100 bps).`,
    `2) Evaluate tail uplift (cross-sell / upsell) for bottom cohort.`,
    `3) Validate data coverage (${f.coverage.rows} rows, ${f.coverage.window}).`,
  ].join("\n");
}

function fmtNum(n?: number | null) {
  if (n === null || n === undefined) return "n/a";
  return n.toLocaleString();
}

function pct(p?: number | null) {
  if (p === null || p === undefined) return "n/a";
  // accept 0..1 or already-in-%; normalize
  const val = Math.abs(p) <= 1 ? p * 100 : p;
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(val).toFixed(2)}%`;
}
