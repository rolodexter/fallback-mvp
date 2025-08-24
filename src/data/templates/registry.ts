/**
 * TEMPLATE_REGISTRY: Maps template_id to runnable template functions
 * Stage-A: Exports template IDs exactly matching those in template_registry.ts
 */

import templateConfig from "./template_registry";
import { runTemplate } from "./index";

// Type for template run functions
export type TemplateRun = (params?: Record<string, any>) => Promise<any>;

// Map template IDs to runnable functions
export const TEMPLATE_REGISTRY: Record<string, TemplateRun> = {
  // Stage-A core templates (must exist)
  business_units_snapshot_yoy_v1: (params) => runTemplate("business_units", params),
  top_counterparties_gross_v1: (params) => runTemplate("counterparties", params),
  monthly_gross_trend_v1: (params) => runTemplate("performance", params),

  // Stage-A++ optional templates
  profitability_summary_v1: (params) => runTemplate("profitability", params),
  regional_performance_v1: (params) => runTemplate("regional", params),
};

/**
 * Get a template function by ID
 * @param id The template ID to get
 * @returns The template function or throws if not found
 */
export async function getTemplate(id: string): Promise<TemplateRun> {
  const t = TEMPLATE_REGISTRY[id];
  if (!t) throw new Error(`Unknown template_id: ${id}`);
  return t;
}

/**
 * Dev-only guard to catch missing template implementations
 * Asserts that all template IDs in the TS registry are implemented
 */
(function devAssertTemplates() {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const wanted = Object.values(templateConfig)
      .map((x: any) => x.templateId)
      .filter(Boolean) as string[];
    const missing = wanted.filter(id => !(id in TEMPLATE_REGISTRY));
    if (missing.length) {
      // eslint-disable-next-line no-console
      console.warn("Missing template implementations:", missing);
    }
  }
})();

export default TEMPLATE_REGISTRY;
