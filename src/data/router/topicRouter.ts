/**
 * Topic router module for determining template_id from detected domains
 * Used to map detected domains to specific templates
 */

import { RouterResult } from './router';

export type TopicRouterResult = {
  domain: string;
  template_id: string;
  params: Record<string, any>;
};

/**
 * Route a detected domain to a specific template with params
 * @param routerResult The result from the router
 * @param message The original user message for additional context
 * @returns Object with domain, template_id and params
 */
export function routeToTemplate(routerResult: RouterResult, message: string): TopicRouterResult {
  const { domain } = routerResult;
  const m = message.toLowerCase();
  
  // Default response with no template
  if (domain === 'none') {
    return { domain, template_id: '', params: {} };
  }
  
  // Performance domain templates
  if (domain === 'performance') {
    // Default performance template
    return { domain, template_id: 'performance_summary_v1', params: {} };
  }
  
  // Counterparties domain templates
  if (domain === 'counterparties') {
    return { domain, template_id: 'top_counterparties_v1', params: {} };
  }
  
  // Risk domain templates
  if (domain === 'risk') {
    return { domain, template_id: 'risk_assessment_v1', params: {} };
  }
  
  // Regional performance
  if (domain === 'regional' || m.includes("regional") || m.includes("regions")) {
    return { domain: "regional", template_id: "regional_performance_v1", params: { window: "24m" } };
  }
  
  // Profitability summary
  if (domain === 'profitability' || m.includes("profit") || m.includes("margin") || m.includes("profitability")) {
    return { domain: "profitability", template_id: "profitability_summary_v1", params: {} };
  }
  
  // Default to domain-named template if exists
  return { domain, template_id: `${domain}_v1`, params: {} };
}
