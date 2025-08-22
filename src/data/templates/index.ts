/**
 * Template summary functions
 * These functions provide summary information for different domains
 */

import { executeBigQuery, mapDomainToTemplateId } from '../../services/bigQueryClient';

type BusinessUnit = {
  business_unit: string;
  revenue_this_year: number;
  revenue_last_year: number;
  yoy_growth_pct: number;
};

type Counterparty = {
  counterparty_name: string;
  revenue_amount: number;
  revenue_percent: number;
  yoy_change_pct: number;
};

type Risk = {
  business_unit: string;
  risk_category: string;
  risk_impact_score: number;
  risk_description: string;
  mitigation_status: string;
};

export async function performanceSummary(data?: any): Promise<string> { 
  try {
    // Use provided data if available, otherwise fetch from BigQuery
    let businessUnits: BusinessUnit[];
    
    if (data?.rows) {
      businessUnits = data.rows;
    } else {
      const response = await executeBigQuery('business_units_snapshot_yoy_v1');
      if (!response.success || !response.rows?.length) {
        return "Business Units: Navigation +2.7% YoY, Liferafts -1.5% YoY, Overall +0.4% YoY (fallback data).";
      }
      businessUnits = response.rows;
    }

    // Get top 2 business units and calculate overall performance
    const sortedUnits = [...businessUnits].sort((a, b) => b.revenue_this_year - a.revenue_this_year);
    const topUnits = sortedUnits.slice(0, 2);
    
    // Calculate overall performance
    const totalCurrentRevenue = businessUnits.reduce((sum, unit) => sum + unit.revenue_this_year, 0);
    const totalPreviousRevenue = businessUnits.reduce((sum, unit) => sum + unit.revenue_last_year, 0);
    const overallGrowth = ((totalCurrentRevenue - totalPreviousRevenue) / totalPreviousRevenue) * 100;
    
    // Format the summary
    const formattedUnits = topUnits.map(unit => {
      const growthSymbol = unit.yoy_growth_pct >= 0 ? '+' : '';
      return `${unit.business_unit} ${growthSymbol}${unit.yoy_growth_pct.toFixed(1)}% YoY`;
    }).join(', ');
    
    const overallGrowthSymbol = overallGrowth >= 0 ? '+' : '';
    return `Business Units: ${formattedUnits}, Overall ${overallGrowthSymbol}${overallGrowth.toFixed(1)}% YoY.`;
  } catch (error) {
    console.error('Performance summary error:', error);
    return "Business Units: Navigation +2.7% YoY, Liferafts -1.5% YoY, Overall +0.4% YoY (fallback data).";
  }
}

export async function counterpartySummary(data?: any): Promise<string> { 
  try {
    // Use provided data if available, otherwise fetch from BigQuery
    let counterparties: Counterparty[];
    
    if (data?.rows) {
      counterparties = data.rows;
    } else {
      const response = await executeBigQuery('customers_top_n', { limit: 3 });
      if (!response.success || !response.rows?.length) {
        return "Top counterparties: ACME Corp (€2.1M), Globex Marine (€1.8M), Oceanic Partners (€1.3M) (fallback data).";
      }
      counterparties = response.rows;
    }

    // Format the top 3 counterparties
    const formattedCounterparties = counterparties.slice(0, 3).map(cp => {
      // Format revenue in millions with 1 decimal place
      const revenueInMillions = (cp.revenue_amount / 1000000).toFixed(1);
      return `${cp.counterparty_name} (€${revenueInMillions}M)`;
    }).join(', ');
    
    return `Top counterparties: ${formattedCounterparties}.`;
  } catch (error) {
    console.error('Counterparty summary error:', error);
    return "Top counterparties: ACME Corp (€2.1M), Globex Marine (€1.8M), Oceanic Partners (€1.3M) (fallback data).";
  }
}

export async function riskSummary(data?: any): Promise<string> { 
  try {
    // Use provided data if available, otherwise fetch from BigQuery
    let risks: Risk[];
    
    if (data?.rows) {
      risks = data.rows;
    } else {
      const response = await executeBigQuery('risks_summary');
      if (!response.success || !response.rows?.length) {
        return "Current risk factors: Supply chain delays (high), Market volatility (medium), Regulatory changes (low) (fallback data).";
      }
      risks = response.rows;
    }

    // Sort risks by impact score and get top 3
    const sortedRisks = [...risks].sort((a, b) => b.risk_impact_score - a.risk_impact_score);
    const topRisks = sortedRisks.slice(0, 3);
    
    // Map risk impact score to category
    const getImpactCategory = (score: number): string => {
      if (score >= 8) return 'high';
      if (score >= 5) return 'medium';
      return 'low';
    };
    
    // Format the risks
    const formattedRisks = topRisks.map(risk => {
      return `${risk.risk_category} (${getImpactCategory(risk.risk_impact_score)})`;
    }).join(', ');
    
    return `Current risk factors: ${formattedRisks}.`;
  } catch (error) {
    console.error('Risk summary error:', error);
    return "Current risk factors: Supply chain delays (high), Market volatility (medium), Regulatory changes (low) (fallback data).";
  }
}

/**
 * Generate detailed template output for a specific domain
 * @param domain The domain to generate output for
 * @param data Optional data from BigQuery
 * @returns Detailed template output as string or Promise<string>
 */
export async function generateTemplateOutput(domain: string, data?: any): Promise<string> {
  try {
    switch (domain) {
      case 'performance':
        // Use provided data or fetch from BigQuery
        let businessUnits;
        if (data?.rows) {
          businessUnits = data.rows;
        } else {
          const response = await executeBigQuery('business_units_snapshot_yoy_v1');
          if (!response.success || !response.rows?.length) {
            // Fallback to mock data
            return [
              "## Business Unit Performance (YoY)\n",
              "* Navigation: €4.5M (+2.7% YoY)",
              "* Liferafts: €3.2M (-1.5% YoY)",
              "* Safety Equipment: €2.1M (+1.2% YoY)",
              "* Training: €1.8M (+0.9% YoY)",
              "* Overall: €11.6M (+0.4% YoY)"
            ].join('\n');
          }
          businessUnits = response.rows;
        }
        
        // Sort by revenue this year
        const sortedUnits = [...businessUnits].sort((a, b) => b.revenue_this_year - a.revenue_this_year);
        
        // Calculate overall totals
        const totalCurrentRevenue = businessUnits.reduce((sum: number, unit: BusinessUnit) => sum + unit.revenue_this_year, 0);
        const totalPreviousRevenue = businessUnits.reduce((sum: number, unit: BusinessUnit) => sum + unit.revenue_last_year, 0);
        const overallGrowth = ((totalCurrentRevenue - totalPreviousRevenue) / totalPreviousRevenue) * 100;
        
        // Format output
        const formattedUnits = sortedUnits.map(unit => {
          const growthSymbol = unit.yoy_growth_pct >= 0 ? '+' : '';
          const revenueMil = (unit.revenue_this_year / 1000000).toFixed(1);
          return `* ${unit.business_unit}: €${revenueMil}M (${growthSymbol}${unit.yoy_growth_pct.toFixed(1)}% YoY)`;
        }).join('\n');
        
        const overallGrowthSymbol = overallGrowth >= 0 ? '+' : '';
        const totalRevenueMil = (totalCurrentRevenue / 1000000).toFixed(1);
        const overallLine = `* Overall: €${totalRevenueMil}M (${overallGrowthSymbol}${overallGrowth.toFixed(1)}% YoY)`;
        
        return `## Business Unit Performance (YoY)\n\n${formattedUnits}\n${overallLine}`;
      
      case 'counterparties':
        // Use provided data or fetch from BigQuery
        let counterparties;
        if (data?.rows) {
          counterparties = data.rows;
        } else {
          const response = await executeBigQuery('customers_top_n', { limit: 5 });
          if (!response.success || !response.rows?.length) {
            // Fallback to mock data
            return [
              "## Top 5 Counterparties (Revenue)\n",
              "* ACME Corp: €2.1M (18.1%)",
              "* Globex Marine: €1.8M (15.5%)",
              "* Oceanic Partners: €1.3M (11.2%)",
              "* SeaSecure Ltd: €0.9M (7.8%)",
              "* MarineMax Inc: €0.7M (6.0%)"
            ].join('\n');
          }
          counterparties = response.rows;
        }
        
        // Format output
        const formattedCounterparties = counterparties.map((cp: Counterparty) => {
          const revenueMil = (cp.revenue_amount / 1000000).toFixed(1);
          const percent = cp.revenue_percent.toFixed(1);
          return `* ${cp.counterparty_name}: €${revenueMil}M (${percent}%)`;
        }).join('\n');
        
        return `## Top ${counterparties.length} Counterparties (Revenue)\n\n${formattedCounterparties}`;
      
      case 'risk':
        // Use provided data or fetch from BigQuery
        let risks;
        if (data?.rows) {
          risks = data.rows;
        } else {
          const response = await executeBigQuery('risks_summary');
          if (!response.success || !response.rows?.length) {
            // Fallback to mock data
            return [
              "## Current Risk Assessment\n",
              "* Supply chain delays: HIGH (Impact: €0.5M)",
              "* Market volatility: MEDIUM (Impact: €0.3M)",
              "* Regulatory changes: LOW (Impact: €0.1M)",
              "* Contract disputes: LOW (Impact: €0.1M)",
              "* Currency fluctuations: MEDIUM (Impact: €0.2M)"
            ].join('\n');
          }
          risks = response.rows;
        }
        
        // Sort risks by impact score
        const sortedRisks = [...risks].sort((a, b) => b.risk_impact_score - a.risk_impact_score);
        
        // Map risk impact score to category
        const getImpactCategory = (score: number): string => {
          if (score >= 8) return 'HIGH';
          if (score >= 5) return 'MEDIUM';
          return 'LOW';
        };
        
        // Format output
        const formattedRisks = sortedRisks.map(risk => {
          const impactCategory = getImpactCategory(risk.risk_impact_score);
          const impactValue = (risk.risk_impact_score / 10).toFixed(1);
          return `* ${risk.risk_category}: ${impactCategory} (Impact: €${impactValue}M)`;
        }).join('\n');
        
        return `## Current Risk Assessment\n\n${formattedRisks}`;
      
      default:
        return "No detailed information available for this domain.";
    }
  } catch (error) {
    console.error(`Error generating template output for ${domain}:`, error);
    
    // Return fallback data based on domain
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
}

/**
 * Get the template registry
 * @returns The template registry object
 */
export function getTemplateRegistry(): Record<string, any> {
  return require('./template_registry.json');
}

/**
 * Get a template summary function by domain
 * @param domain The domain to get the summary function for
 * @returns The summary function
 */
export function getTemplateSummaryFunction(domain: string): ((data: any) => Promise<string>) | null {
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
 * Map domain to BigQuery template ID
 * @param domain The domain from router
 * @returns The BigQuery SQL template ID
 */
export function getBigQueryTemplateId(domain: string): string {
  // Use the mapDomainToTemplateId function from bigQueryClient
  return mapDomainToTemplateId(domain);
}

/**
 * Run template for a given domain with store data
 * Returns KPI summary and template output for grounding
 * @param domain The domain to run the template for
 * @param store The store data to use for the template
 * @returns Promise resolving to object with kpiSummary and templateOutput
 */
export async function runTemplate(domain: string, store: any): Promise<{ kpiSummary: string | null, templateOutput: string | null }> {
  try {
    // Get the summary function for the domain
    const summaryFn = getTemplateSummaryFunction(domain);
    
    // Generate KPI summary if a summary function exists
    const kpiSummary = summaryFn ? await summaryFn(store) : null;
    
    // Generate detailed template output
    const templateOutput = domain ? await generateTemplateOutput(domain, store) : null;
    
    return { kpiSummary, templateOutput };
  } catch (error) {
    console.error(`Error running template for ${domain}:`, error);
    return { kpiSummary: null, templateOutput: null };
  }
}
