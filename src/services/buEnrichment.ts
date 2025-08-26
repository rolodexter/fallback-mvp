/**
 * Business Unit Enrichment Service
 * Provides contextual enrichment for business unit importance data
 */
import { callLLMProvider } from './llmProvider';

interface BusinessUnitData {
  bu_code: string;
  bu_name: string;
  metric_value: number;
  percentage_of_total: number;
  yoy_growth_pct: number;
  importance_level: string;
  importance_reason: string;
}

interface EnrichedBusinessUnitData extends BusinessUnitData {
  context: string;
  strategic_importance: string;
  challenges: string;
  opportunities: string;
}

/**
 * Enriches business unit data with strategic context from LLM
 * @param buData Business unit ranking data from the template
 * @param metric The metric used for ranking (e.g. revenue, gross)
 * @returns Enriched business unit data with contextual information
 */
export async function enrichBusinessUnitData(
  buData: BusinessUnitData[],
  metric: string,
  contextRequest: string = 'top_performers' // 'top_performers' or 'underperformers'
): Promise<EnrichedBusinessUnitData[]> {
  if (!buData || buData.length === 0) return [];

  // Identify target business unit
  const targetBu = buData[0];
  const isUnderperformer = contextRequest === 'underperformers';
  
  // Create appropriate prompt based on context request
  const analysisPrompt = isUnderperformer ? 
    // Underperformer analysis prompt
    `
You are analyzing the least profitable/performing business unit in our company.

UNDERPERFORMING BUSINESS UNIT:
- Code: ${targetBu.bu_code}
- Name: ${targetBu.bu_name}
- ${metric.toUpperCase()}: ${targetBu.metric_value.toLocaleString()}
- Share of total: ${targetBu.percentage_of_total}%
- YoY growth: ${targetBu.yoy_growth_pct}%
- Performance level: ${targetBu.importance_level || 'Underperforming'}
- Primary concern: ${targetBu.importance_reason || 'Low performance relative to other units'}

OTHER LOW-PERFORMING UNITS:
${buData.slice(1, 3).map(bu => `- ${bu.bu_name}: ${bu.percentage_of_total}% of total, ${bu.yoy_growth_pct}% growth`).join('\n')}

Provide a detailed analysis of this underperforming business unit. Include:
1. Possible causes for underperformance (2-3 sentences)
2. Key risks if not addressed (1-2 sentences)
3. Potential turnaround opportunities (1-2 sentences)
4. Comparison with other underperforming units (1-2 sentences)

Format your response as JSON with these exact fields: 
{
  "context": "overall context paragraph",
  "strategic_importance": "analysis of significance despite poor performance",
  "challenges": "key challenges and risks",
  "opportunities": "potential turnaround strategies"
}
` :
    // Top performer analysis prompt
    `
You are analyzing the most important business unit in our company.

TOP BUSINESS UNIT:
- Code: ${targetBu.bu_code}
- Name: ${targetBu.bu_name}
- ${metric.toUpperCase()}: ${targetBu.metric_value.toLocaleString()}
- Share of total: ${targetBu.percentage_of_total}%
- YoY growth: ${targetBu.yoy_growth_pct}%
- Importance: ${targetBu.importance_level || 'Top Performer'}
- Primary reason: ${targetBu.importance_reason || 'High contribution to overall business'}

TOP COMPETITOR UNITS:
${buData.slice(1, 3).map(bu => `- ${bu.bu_name}: ${bu.percentage_of_total}% of total, ${bu.yoy_growth_pct}% growth`).join('\n')}

Provide a detailed analysis of why this business unit is strategically important. Include:
1. Strategic importance (2-3 sentences)
2. Key challenges (1-2 sentences)
3. Future opportunities (1-2 sentences)
4. Comparison with other top units (1-2 sentences)

Format your response as JSON with these exact fields: 
{
  "context": "overall context paragraph",
  "strategic_importance": "strategic importance analysis",
  "challenges": "key challenges",
  "opportunities": "future opportunities"
}
`;

  const systemPrompt = "You are a financial analyst providing strategic context about business units. Respond ONLY with valid JSON.";
  
  try {
    const analysis = await callLLMProvider(analysisPrompt, systemPrompt, []);
    
    // Extract JSON from response
    const jsonMatch = analysis.match(/```json\n([\s\S]*?)\n```/) || analysis.match(/\{[\s\S]*\}/);
    let parsedAnalysis;
    
    if (jsonMatch) {
      try {
        parsedAnalysis = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch (e) {
        console.error('Failed to parse LLM response as JSON', e);
        parsedAnalysis = {
          context: "Analysis unavailable due to parsing error.",
          strategic_importance: "",
          challenges: "",
          opportunities: ""
        };
      }
    } else {
      // Try to parse the whole response if no JSON pattern matched
      try {
        parsedAnalysis = JSON.parse(analysis);
      } catch (e) {
        console.error('Failed to parse whole LLM response as JSON', e);
        parsedAnalysis = {
          context: analysis.substring(0, 200) + "...", // Use a truncated version of the raw response
          strategic_importance: "",
          challenges: "",
          opportunities: ""
        };
      }
    }
    
    // Enrich top BU with analysis
    const enriched: EnrichedBusinessUnitData[] = buData.map((bu, index) => {
      if (index === 0) {
        return {
          ...bu,
          context: parsedAnalysis.context || "",
          strategic_importance: parsedAnalysis.strategic_importance || "",
          challenges: parsedAnalysis.challenges || "",
          opportunities: parsedAnalysis.opportunities || ""
        };
      }
      return {
        ...bu,
        context: "",
        strategic_importance: "",
        challenges: "",
        opportunities: ""
      };
    });
    
    return enriched;
  } catch (e) {
    console.error('Error enriching business unit data:', e);
    return buData.map(bu => ({
      ...bu,
      context: "Unable to generate strategic analysis at this time.",
      strategic_importance: "",
      challenges: "",
      opportunities: ""
    }));
  }
}

/**
 * Synthesizes a natural language response about the most important business unit
 * @param enrichedData Enriched business unit data
 * @param metric The metric used for ranking
 * @returns A natural language response about the most important business unit
 */
export async function synthesizeBuImportanceResponse(
  enrichedData: EnrichedBusinessUnitData[],
  metric: string,
  contextRequest: string = 'top_performers' // 'top_performers' or 'underperformers'
): Promise<string> {
  if (!enrichedData || enrichedData.length === 0) {
    return "I don't have enough information to determine the requested business unit performance data.";
  }

  const targetBu = enrichedData[0];
  const isUnderperformer = contextRequest === 'underperformers';
  
  // Create a synthesis prompt based on context request
  const synthesisPrompt = isUnderperformer ?
    // Underperformer synthesis prompt
    `
Create a natural, conversational response explaining our least profitable/performing business unit:

BUSINESS UNIT: ${targetBu.bu_name} (${targetBu.bu_code})
METRICS:
- ${metric.toUpperCase()}: ${targetBu.metric_value.toLocaleString()}
- Share of total: ${targetBu.percentage_of_total}%
- YoY growth: ${targetBu.yoy_growth_pct}%

CONTEXT: ${targetBu.context}
STRATEGIC IMPORTANCE: ${targetBu.strategic_importance}
CHALLENGES: ${targetBu.challenges}
OPPORTUNITIES: ${targetBu.opportunities}

COMPARISON WITH OTHER UNITS:
${enrichedData.slice(1, 3).map(bu => `- ${bu.bu_name}: ${bu.percentage_of_total}% of total, ${bu.yoy_growth_pct}% growth`).join('\n')}

Write a conversational, executive-friendly response that:
1. Clearly identifies the least profitable/performing business unit
2. Explains potential causes for underperformance (using metrics and context)
3. Briefly mentions key risks and turnaround opportunities
4. Briefly compares with other underperforming units

Do not use bullet points or headers. Make it flow like a natural conversation. Keep it under 6 sentences total.
` :
    // Top performer synthesis prompt
    `
Create a natural, conversational response explaining our most important business unit:

BUSINESS UNIT: ${targetBu.bu_name} (${targetBu.bu_code})
METRICS:
- ${metric.toUpperCase()}: ${targetBu.metric_value.toLocaleString()}
- Share of total: ${targetBu.percentage_of_total}%
- YoY growth: ${targetBu.yoy_growth_pct}%

CONTEXT: ${targetBu.context}
STRATEGIC IMPORTANCE: ${targetBu.strategic_importance}
CHALLENGES: ${targetBu.challenges}
OPPORTUNITIES: ${targetBu.opportunities}

COMPARISON WITH OTHER UNITS:
${enrichedData.slice(1, 3).map(bu => `- ${bu.bu_name}: ${bu.percentage_of_total}% of total, ${bu.yoy_growth_pct}% growth`).join('\n')}

Write a conversational, executive-friendly response that:
1. Clearly identifies the most important business unit
2. Explains why it's important (using metrics and context)
3. Briefly mentions strategic importance and future outlook
4. Briefly compares with other top units

Do not use bullet points or headers. Make it flow like a natural conversation. Keep it under 6 sentences total.
`;

  const systemPrompt = "You are a financial analyst communicating with executives. Your tone is clear, authoritative but conversational. Respond with plain text only.";
  
  try {
    return await callLLMProvider(synthesisPrompt, systemPrompt, []);
  } catch (e) {
    console.error('Error synthesizing BU importance response:', e);
    return `Our most important business unit is ${topBu.bu_name} (${topBu.bu_code}), representing ${topBu.percentage_of_total}% of our total ${metric} with ${topBu.yoy_growth_pct}% year-over-year growth.`;
  }
}
