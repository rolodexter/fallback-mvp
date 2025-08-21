/**
 * Template summary functions
 * These functions provide summary information for different domains
 */

export function performanceSummary(_data?: any) { 
  return "YoY performance is stable (mock)."; 
}

export function counterpartySummary(_data?: any) { 
  return "Top counterparties: ACME, Globex (mock)."; 
}

export function riskSummary(_data?: any) { 
  return "No major risks flagged (mock)."; 
}

/**
 * Get the template registry
 * @returns The template registry object
 */
export function getTemplateRegistry() {
  return require('./template_registry.json');
}

/**
 * Get a template summary function by domain
 * @param domain The domain to get the summary function for
 * @returns The summary function
 */
export function getTemplateSummaryFunction(domain: string): ((data: any) => string) | null {
  const registry = getTemplateRegistry();
  const templateInfo = registry[domain];
  
  if (!templateInfo) return null;
  
  switch (templateInfo.summaryFn) {
    case 'performanceSummary':
      return performanceSummary;
    case 'counterpartySummary':
      return counterpartySummary;
    case 'riskSummary':
      return riskSummary;
    default:
      return null;
  }
}
