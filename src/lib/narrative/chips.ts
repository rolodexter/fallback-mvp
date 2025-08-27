// src/lib/narrative/chips.ts
import type { FactsPack } from "./facts";

export type Chip = { label: string; route: string; params: Record<string, any> };

export function chipsFor(f: FactsPack, templateId: string): Chip[] {
  const chips: Chip[] = [];

  if (f.topk?.length) {
    chips.push({
      label: `Why ${f.topk[0].name}?`,
      route: "metric_snapshot_year_v1",
      params: { unit: f.topk[0].name, metric: f.metric ?? "gross" },
    });
  }

  if (f.concentration?.top3 && f.concentration.top3 > 0.60) {
    chips.push({
      label: "Concentration by decile",
      route: "metric_breakdown_by_unit_v1",
      params: { metric: f.metric ?? "gross", unit: f.unit ?? "ALL" },
    });
  }

  chips.push({
    label: "MoM change",
    route: "metric_timeseries_v1",
    params: { metric: f.metric ?? "gross", period: "last_12m", unit: f.unit ?? "ALL" },
  });

  return chips;
}
