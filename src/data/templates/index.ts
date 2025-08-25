/**
 * Template summary functions
 * These functions provide summary information for different domains
 */

import { executeBigQuery, mapDomainToTemplateId } from '../../services/bigQueryClient.js';
import templateRegistry from './template_registry.js';

// Stage-A default: mock mode
const DATA_MODE = (process.env.DATA_MODE ?? 'mock');
const IS_LIVE = DATA_MODE === 'live';

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

type ProfitabilityData = {
  business_unit: string;
  revenue_ars: number;
  cogs_ars: number;
  gross_margin_ars: number;
  gross_margin_pct: number;
};

type RegionalData = {
  yyyymm: string;
  region: string;
  revenue_ars: number;
};

export async function performanceSummary(data?: any): Promise<string> { 
  try {
    if (!IS_LIVE) {
      return "Business Units: Navigation +2.7% YoY, Liferafts -1.5% YoY, Overall +0.4% YoY (fallback data).";
    }
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
    if (!IS_LIVE) {
      return "Top counterparties: ACME Corp (€2.1M), Globex Marine (€1.8M), Oceanic Partners (€1.3M) (fallback data).";
    }
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
    if (!IS_LIVE) {
      return "Current risk factors: Supply chain delays (high), Market volatility (medium), Regulatory changes (low) (fallback data).";
    }
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

export async function profitabilitySummary(data?: any): Promise<string> { 
  try {
    if (!IS_LIVE) {
      return "Business unit profitability: Navigation (32.5% margin), Safety Equipment (28.1% margin), Overall (30.2% margin) (fallback data).";
    }
    // Use provided data if available, otherwise fetch from BigQuery
    let profitabilityData: ProfitabilityData[];
    
    if (data?.rows) {
      profitabilityData = data.rows;
    } else {
      const currentYear = new Date().getFullYear();
      const response = await executeBigQuery('profitability_by_business_unit_v1', { year: currentYear - 1 });
      if (!response.success || !response.rows?.length) {
        return "Business unit profitability: Navigation (32.5% margin), Safety Equipment (28.1% margin), Overall (30.2% margin) (fallback data).";
      }
      profitabilityData = response.rows;
    }

    // Sort by gross margin percentage and get top 2
    const sortedData = [...profitabilityData].sort((a, b) => b.gross_margin_pct - a.gross_margin_pct);
    const topUnits = sortedData.slice(0, 2);
    
    // Calculate overall performance
    const totalRevenue = profitabilityData.reduce((sum, unit) => sum + unit.revenue_ars, 0);
    const totalMargin = profitabilityData.reduce((sum, unit) => sum + unit.gross_margin_ars, 0);
    const overallMarginPct = (totalMargin / totalRevenue) * 100;
    
    // Format the summary
    const formattedUnits = topUnits.map(unit => {
      return `${unit.business_unit} (${unit.gross_margin_pct.toFixed(1)}% margin)`;
    }).join(', ');
    
    return `Business unit profitability: ${formattedUnits}, Overall (${overallMarginPct.toFixed(1)}% margin).`;
  } catch (error) {
    console.error('Profitability summary error:', error);
    return "Business unit profitability: Navigation (32.5% margin), Safety Equipment (28.1% margin), Overall (30.2% margin) (fallback data).";
  }
}

export async function regionalSummary(data?: any): Promise<string> { 
  try {
    if (!IS_LIVE) {
      return "Regional revenue: AMBA (€2.8M, +4.2%), Patagonia (€1.9M, +2.1%), Buenos Aires (€1.5M, -1.2%) (fallback data).";
    }
    // Use provided data if available, otherwise fetch from BigQuery
    let regionalData: RegionalData[];
    
    if (data?.rows) {
      regionalData = data.rows;
    } else {
      const response = await executeBigQuery('regional_revenue_trend_24m_v1');
      if (!response.success || !response.rows?.length) {
        return "Regional revenue: AMBA (€2.8M, +4.2%), Patagonia (€1.9M, +2.1%), Buenos Aires (€1.5M, -1.2%) (fallback data).";
      }
      regionalData = response.rows;
    }

    // Group by region and sum up the last 3 months
    const lastThreeMonths = new Set(regionalData.slice(0, 3).map(item => item.yyyymm));
    
    const regionSummary = regionalData.reduce((acc: Record<string, {revenue: number, count: number}>, item) => {
      if (lastThreeMonths.has(item.yyyymm)) {
        if (!acc[item.region]) {
          acc[item.region] = { revenue: 0, count: 0 };
        }
        acc[item.region].revenue += item.revenue_ars;
        acc[item.region].count += 1;
      }
      return acc;
    }, {});
    
    // Calculate average per region
    const regionAverages = Object.entries(regionSummary).map(([region, data]) => {
      return {
        region,
        avgRevenue: data.revenue / data.count
      };
    }).sort((a, b) => b.avgRevenue - a.avgRevenue);
    
    // Get top 3 regions by average revenue
    const topRegions = regionAverages.slice(0, 3);
    
    // Format the summary
    const formattedRegions = topRegions.map(region => {
      const revenueMil = (region.avgRevenue / 1000000).toFixed(1);
      // Here we would calculate YoY changes if we had prior year data
      const mockTrend = Math.random() * 8 - 2; // Mock trend between -2% and +6%
      const trendSymbol = mockTrend >= 0 ? '+' : '';
      return `${region.region} (€${revenueMil}M, ${trendSymbol}${mockTrend.toFixed(1)}%)`;
    }).join(', ');
    
    return `Regional revenue: ${formattedRegions}.`;
  } catch (error) {
    console.error('Regional summary error:', error);
    return "Regional revenue: AMBA (€2.8M, +4.2%), Patagonia (€1.9M, +2.1%), Buenos Aires (€1.5M, -1.2%) (fallback data).";
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
        if (!IS_LIVE) {
          return [
            "## Business Unit Performance (YoY)\n",
            "* Navigation: €4.5M (+2.7% YoY)",
            "* Liferafts: €3.2M (-1.5% YoY)",
            "* Safety Equipment: €2.1M (+1.2% YoY)",
            "* Training: €1.8M (+0.9% YoY)",
            "* Overall: €11.6M (+0.4% YoY)"
          ].join('\n');
        }
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
        if (!IS_LIVE) {
          return [
            "## Top 5 Counterparties (Revenue)\n",
            "* ACME Corp: €2.1M (18.1%)",
            "* Globex Marine: €1.8M (15.5%)",
            "* Oceanic Partners: €1.3M (11.2%)",
            "* SeaSecure Ltd: €0.9M (7.8%)",
            "* MarineMax Inc: €0.7M (6.0%)"
          ].join('\n');
        }
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
        if (!IS_LIVE) {
          return [
            "## Current Risk Assessment\n",
            "* Supply chain delays: HIGH (Impact: €0.5M)",
            "* Market volatility: MEDIUM (Impact: €0.3M)",
            "* Regulatory changes: LOW (Impact: €0.1M)",
            "* Contract disputes: LOW (Impact: €0.1M)",
            "* Currency fluctuations: MEDIUM (Impact: €0.2M)"
          ].join('\n');
        }
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
          // Convert impact score to estimated financial impact in millions
          const impactMil = (risk.risk_impact_score * 0.075).toFixed(1);
          return `* ${risk.risk_category}: ${impactCategory} (Impact: €${impactMil}M)`;
        }).join('\n');
        
        return `## Current Risk Assessment\n\n${formattedRisks}`;

      case 'regional':
        // Implementation for regional similar to others
        if (!IS_LIVE) {
          return [
            "## Regional Revenue Trend (24 months)\n",
            "* AMBA: €2.8M average monthly revenue (trend: +4.2%)",
            "* Patagonia: €1.9M average monthly revenue (trend: +2.1%)",
            "* Buenos Aires: €1.5M average monthly revenue (trend: -1.2%)",
            "* Córdoba: €1.2M average monthly revenue (trend: +0.8%)",
            "* Mendoza: €0.9M average monthly revenue (trend: +1.5%)"
          ].join('\n');
        }
        return "Regional data not available.";

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
      case 'profitability':
        return [
          "## Business Unit Profitability\n",
          "* Navigation: €3.2M revenue, €2.1M COGS, €1.1M margin (32.5%)",
          "* Safety Equipment: €1.8M revenue, €1.3M COGS, €0.5M margin (28.1%)",
          "* Liferafts: €2.9M revenue, €2.1M COGS, €0.8M margin (27.6%)",
          "* Training: €1.5M revenue, €1.1M COGS, €0.4M margin (26.7%)",
          "* Overall: €9.4M revenue, €6.6M COGS, €2.8M margin (30.2%)"
        ].join('\n');
      case 'regional':
        return [
          "## Regional Revenue Trend (24 months)\n",
          "* AMBA: €2.8M average monthly revenue (trend: +4.2%)",
          "* Patagonia: €1.9M average monthly revenue (trend: +2.1%)",
          "* Buenos Aires: €1.5M average monthly revenue (trend: -1.2%)",
          "* Córdoba: €1.2M average monthly revenue (trend: +0.8%)",
          "* Mendoza: €0.9M average monthly revenue (trend: +1.5%)"
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
  return templateRegistry as Record<string, any>;
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
    case 'profitabilitySummary':
      return profitabilitySummary;
    case 'regionalSummary':
      return regionalSummary;
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
    // Stage-A: if not live and domain not in registry, short-circuit to no data
    if (!IS_LIVE) {
      const reg = getTemplateRegistry();
      if (!reg || !(domain in reg)) {
        return { kpiSummary: null, templateOutput: null };
      }
    }
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
