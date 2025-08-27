// Centralized template barrel with deterministic provenance tagging,
// compatible with legacy (runBQ/runMock) and new (run(deps, params)) modules.

import * as registry from "./templates/template_registry";

// ----------------- Types -----------------
export type Provenance = {
  source: "bq" | "mock";
  tag?:
    | "TEMPLATE_RUN"
    | "NO_DATA"
    | "SERVER_ERROR"
    | "BQ_ERROR"
    | "TEMPLATE_NOT_FOUND"
    | string;
  template?: string;
  domain?: string;
  ms?: number;
  [k: string]: any;
};

export type TemplateResult = {
  text?: string;
  widgets?: any[];
  rows?: any[];
  facts_pack?: any;
  meta?: any;
  provenance?: Provenance;
  [k: string]: any; // allow legacy fields (kpiSummary, etc.)
};

type Runner = (deps: any, params: any) => Promise<TemplateResult>;

type TemplateModuleNew = { id: string; domain?: string; run: Runner };
type TemplateModuleLegacy = {
  id?: string;
  domain?: string;
  runBQ?: (params: any) => Promise<TemplateResult>;
  runMock?: (params: any) => Promise<TemplateResult>;
};

type AnyTemplate = TemplateModuleNew | TemplateModuleLegacy;

// ----------------- Registry wiring -----------------
// Most repos export a named `templateRunners` map; some also export a default domain map.
const RUNNERS: Record<string, AnyTemplate> =
  (registry as any).templateRunners ??
  (registry as any).REGISTRY ?? // optional alternative
  {};

const DOMAIN_MAP: Record<string, string[] | Record<string, any>> =
  (registry as any).default ?? // often a domain->ids map
  (registry as any).templateRegistry ?? // alternate name
  {};

// ----------------- Utils -----------------
function mapModeToDataMode(mode?: string): "live" | "mock" {
  const m = String(mode || process.env.DATA_MODE || "mock").toLowerCase();
  return m === "bq" || m === "live" ? "live" : "mock";
}

function inferDomainFor(templateId: string): string | undefined {
  for (const [domain, val] of Object.entries(DOMAIN_MAP)) {
    if (Array.isArray(val) && (val as any).includes?.(templateId)) return domain;
    if (!Array.isArray(val) && typeof val === "object") {
      if ((val as any)[templateId]) return domain;
      if (Array.isArray((val as any).ids) && (val as any).ids.includes(templateId)) return domain;
    }
  }
  return undefined;
}

/** Payload heuristic used for tagging */
export function hasPayload(out: TemplateResult | undefined) {
  if (!out) return false;
  if (Array.isArray(out.widgets) && out.widgets.length) return true;
  if (Array.isArray(out.rows) && out.rows.length) return true;
  if (out.facts_pack?.rank && out.facts_pack.rank.length) return true;
  if (Array.isArray((out as any).data) && (out as any).data.length) return true;
  if ((out as any).table?.rows?.length) return true;
  return false;
}

/** Live + successful tag check for gating LLM synthesis */
export function isLiveRun(out: TemplateResult | undefined) {
  const p = out?.provenance;
  return !!(p && p.source === "bq" && p.tag === "TEMPLATE_RUN");
}

// Pick appropriate runner given module shape & dataMode
function selectRunner(mod: AnyTemplate, dataMode: "live" | "mock"): Runner {
  // New unified module
  if ((mod as TemplateModuleNew).run) {
    const run = (mod as TemplateModuleNew).run;
    return (deps: any, params: any) => run(deps, params);
  }
  // Legacy module
  const legacy = mod as TemplateModuleLegacy;
  if (dataMode === "live" && typeof legacy.runBQ === "function") {
    return async (_deps: any, params: any) => legacy.runBQ!(params);
  }
  if (dataMode === "mock" && typeof legacy.runMock === "function") {
    return async (_deps: any, params: any) => legacy.runMock!(params);
  }
  // Fallback: if only one exists, use it
  if (typeof legacy.runBQ === "function") {
    return async (_deps: any, params: any) => legacy.runBQ!(params);
  }
  if (typeof legacy.runMock === "function") {
    return async (_deps: any, params: any) => legacy.runMock!(params);
  }
  throw new Error("NO_COMPATIBLE_RUNNER");
}

// ----------------- Compat argument coercion -----------------
type Coerced = { deps: any; params: any; dataMode: "live" | "mock" };

/**
 * Supports:
 *  - runTemplate(id, params)
 *  - runTemplate(id, params, "live"|"bq"|"mock")
 *  - runTemplate(id, { dataMode, bq, ... }, params)
 */
function coerceArgs(a?: any, b?: any): Coerced {
  // new-style: a is deps (has dataMode), b is params
  if (a && typeof a === "object" && ("dataMode" in a || "b" in a || "bq" in a)) {
    const dataMode = mapModeToDataMode(a.dataMode);
    return { deps: a, params: b, dataMode };
  }
  // legacy: a is params, b is mode string
  if (typeof b === "string") {
    const dataMode = mapModeToDataMode(b);
    return { deps: { dataMode }, params: a, dataMode };
  }
  // simplest: a is params, infer mode from env
  const dataMode = mapModeToDataMode(process.env.DATA_MODE as any);
  return { deps: { dataMode }, params: a, dataMode };
}

// ----------------- Main wrapper -----------------
export async function runTemplate(
  id: string,
  a?: any,
  b?: any
): Promise<TemplateResult> {
  const mod = RUNNERS[id] as AnyTemplate | undefined;
  if (!mod) {
    return {
      mode: "no_data",
      text: `Template ${id} not found.`,
      widgets: [],
      meta: { groundingType: "template" },
      provenance: {
        source: mapModeToDataMode(process.env.DATA_MODE as any) === "live" ? "bq" : "mock",
        tag: "TEMPLATE_NOT_FOUND",
        template: id,
      },
    };
  }

  const { deps, params, dataMode } = coerceArgs(a, b);
  const t0 = Date.now();

  try {
    const run = selectRunner(mod, dataMode);
    const out = await run(deps, params);

    const prov: Provenance = (out?.provenance ?? {}) as Provenance;
    prov.template = prov.template ?? ((mod as any).id ?? id);
    prov.domain   = prov.domain   ?? (mod as any).domain ?? inferDomainFor(id);
    prov.source   = prov.source   ?? (dataMode === "live" ? "bq" : "mock");
    prov.ms       = prov.ms       ?? (Date.now() - t0);

    // Respect a runner-supplied error tag; otherwise set deterministic tag
    if (!prov.tag) {
      if (prov.source === "bq") {
        prov.tag = hasPayload(out) ? "TEMPLATE_RUN" : "NO_DATA";
      } else {
        prov.tag = "TEMPLATE_RUN"; // demo/dev
      }
    }

    out.provenance = prov;
    out.meta = out.meta ?? { groundingType: "template" };
    return out;
  } catch (e: any) {
    return {
      mode: "no_data",
      text: "Live data unavailable right now.",
      widgets: [],
      meta: { groundingType: "template" },
      provenance: {
        source: dataMode === "live" ? "bq" : "mock",
        tag: "SERVER_ERROR",
        template: (mod as any).id ?? id,
        domain: (mod as any).domain ?? inferDomainFor(id),
        error_msg: String(e?.message || e),
        ms: Date.now() - t0,
      },
    };
  }
}

// Optional: export the raw map for diagnostics/tests
export { RUNNERS as REGISTRY };
