/**
 * Template summary functions
 * These functions provide summary information for different domains
 */

export function performanceSummary(_data?: any) { 
  return "Business Units: Navigation +2.7% YoY, Liferafts -1.5% YoY, Overall +0.4% YoY (mock data)."; 
}

export function counterpartySummary(_data?: any) { 
  return "Top counterparties: ACME Corp (€2.1M), Globex Marine (€1.8M), Oceanic Partners (€1.3M) (mock data)."; 
}

export function riskSummary(_data?: any) { 
  return "Current risk factors: Supply chain delays (high), Market volatility (medium), Regulatory changes (low) (mock data)."; 
}

/**
 * Generate detailed template output for a specific domain
 * @param domain The domain to generate output for
 * @returns Detailed template output as string
 */
export function generateTemplateOutput(domain: string, _data?: any): string {
  switch (domain) {
    case 'performance':
      return [
        "## Business Unit Performance (YoY)\n",
        "* Navigation: €4.5M (+2.7% YoY)",
        "* Liferafts: €3.2M (-1.5% YoY)",
        "* Safety Equipment: €2.1M (+1.2% YoY)",
        "* Training: €1.8M (+0.9% YoY)",
        "* Overall: €11.6M (+0.4% YoY)"
      ].join('\n');
    
    case 'counterparties':
      return [
        "## Top 5 Counterparties (Revenue)\n",
        "* ACME Corp: €2.1M (18.1%)",
        "* Globex Marine: €1.8M (15.5%)",
        "* Oceanic Partners: €1.3M (11.2%)",
        "* SeaSecure Ltd: €0.9M (7.8%)",
        "* MarineMax Inc: €0.7M (6.0%)"
      ].join('\n');
    
    case 'risk':
      return [
        "## Current Risk Assessment\n",
        "* Supply chain delays: HIGH (Impact: €0.5M)",
        "* Market volatility: MEDIUM (Impact: €0.3M)",
        "* Regulatory changes: LOW (Impact: €0.1M)",
        "* Contract disputes: LOW (Impact: €0.1M)",
        "* Currency fluctuations: MEDIUM (Impact: €0.2M)"
      ].join('\n');
    
    default:
      return "No detailed information available for this domain.";
  }
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

/**
 * Run template for a given domain with store data
 * Returns KPI summary and template output for grounding
 * @param domain The domain to run the template for
 * @param store The store data to use for the template
 * @returns Object with kpiSummary and templateOutput
 */
export function runTemplate(domain: string, store: any): { kpiSummary: string | null, templateOutput: string | null } {
  // Get the summary function for the domain
  const summaryFn = getTemplateSummaryFunction(domain);
  
  // Generate KPI summary if a summary function exists
  const kpiSummary = summaryFn ? summaryFn(store) : null;
  
  // Generate detailed template output
  const templateOutput = domain ? generateTemplateOutput(domain, store) : null;
  
  return { kpiSummary, templateOutput };
}
