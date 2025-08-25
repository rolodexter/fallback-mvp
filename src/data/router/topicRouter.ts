/**
 * Topic router module for determining template_id from detected domains
 * Used to map detected domains to specific templates
 * Stage-A: Deterministic routes for canonical prompts
 */

import type { RouterResult } from './router.js';

export type TopicRouterResult = {
  domain: string;
  template_id: string;
  params: Record<string, any>;
};

export type RouteHit = { domain?: string; template_id?: string; params?: Record<string, any> };

// Accept both abbreviations and full names, normalize to full month name
const MONTHS_MAP: Record<string, string> = {
  jan: 'january', january: 'january',
  feb: 'february', february: 'february',
  mar: 'march', march: 'march',
  apr: 'april', april: 'april',
  may: 'may',
  jun: 'june', june: 'june',
  jul: 'july', july: 'july',
  aug: 'august', august: 'august',
  sep: 'september', sept: 'september', september: 'september',
  oct: 'october', october: 'october',
  nov: 'november', november: 'november',
  dec: 'december', december: 'december'
};

/**
 * Deterministically route a message to the correct template
 * Stage-A: Hard-coded routes for canonical prompts
 * @param msg The user message to route
 * @returns Object with domain, template_id and params
 */
export function routeMessage(msg: string): RouteHit {
  const m = (msg||'').toLowerCase().trim();

  const bu = m.match(/\b(z0\d{2}|z\d{3})\b/);
  const monKey = Object.keys(MONTHS_MAP).find(x => m.includes(x));
  const mon = monKey ? MONTHS_MAP[monKey] : undefined;
  if (bu && mon && m.includes("snapshot")) {
    return { domain:"business_units", template_id:"business_units_snapshot_yoy_v1", params:{ bu: bu[0].toUpperCase(), month: mon } };
  }

  if (m.includes("counterparties") && (m.includes("ytd") || m.includes("year to date"))) {
    return { domain:"counterparties", template_id:"top_counterparties_gross_v1", params:{ range:"ytd" } };
  }

  // Top counterparties without explicit YTD qualifier
  if ((m.includes("top 3 counterparties") || m.includes("top counterparties")) && !m.includes("ytd") && !m.includes("year to date")) {
    // Default to YTD in Stage-A when not specified
    return { domain: "counterparties", template_id: "top_counterparties_gross_v1", params: { range: "ytd" } };
  }

  if (m.includes("monthly") && (m.includes("gross") || m.includes("trend"))) {
    return { domain:"performance", template_id:"monthly_gross_trend_v1", params:{ window:"24m" } };
  }

  // Synonym: list all business units -> explicit BU list template id
  if (m.includes("list") && (m.includes("business units") || m.includes("bus"))) {
    return { domain: "profitability", template_id: "business_units_list_v1", params: {} };
  }

  // Regional performance explicit cues (canonical): "regional", "by region", or known region names
  if (
    m.includes("regional") ||
    m.includes("by region") ||
    m.includes("amba") ||
    m.includes("patagonia") ||
    m.includes("buenos aires") ||
    m.includes("cordoba") ||
    m.includes("córdoba") ||
    m.includes("mendoza")
  ) {
    return { domain: "regional", template_id: "regional_performance_v1", params: { window: "24m" } };
  }

  // Profitability cues (canonical): "profitability", "margin"
  if (m.includes("profitability") || m.includes("margin")) {
    return { domain: "profitability", template_id: "profitability_summary_v1", params: {} };
  }

  return {}; // Intro/nodata
}

/**
 * Route a detected domain to a specific template with params
 * @param routerResult The result from the router
 * @param message The original user message for additional context
 * @returns Object with domain, template_id and params
 */
export function routeToTemplate(routerResult: RouterResult, message: string): TopicRouterResult {
  // First, use deterministic routing for canonical prompts
  const deterministicRoute = routeMessage(message);
  
  // If we have a deterministic route, use that
  if (deterministicRoute.domain && deterministicRoute.template_id) {
    return {
      domain: deterministicRoute.domain,
      template_id: deterministicRoute.template_id,
      params: deterministicRoute.params || {}
    };
  }
  
  // Fall back to domain-based routing
  const { domain } = routerResult;
  
  // Default response with no template
  if (domain === 'none') {
    return { domain, template_id: '', params: {} };
  }
  
  // Regular performance domain templates
  if (domain === 'performance') {
    return { domain, template_id: 'monthly_gross_trend_v1', params: {} };
  }
  
  // Regular counterparties domain templates
  if (domain === 'counterparties') {
    return { domain, template_id: 'top_counterparties_gross_v1', params: {} };
  }
  
  // Regional performance
  if (domain === 'regional') {
    return { domain, template_id: 'regional_performance_v1', params: { window: '24m' } };
  }
  
  // Profitability summary
  if (domain === 'profitability') {
    return { domain, template_id: 'profitability_summary_v1', params: {} };
  }
  
  // Default to domain-named template if exists
  return { domain, template_id: `${domain}_v1`, params: {} };
}
