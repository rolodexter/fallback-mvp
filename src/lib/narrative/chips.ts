/**
 * Context-aware drill-down chip generator
 * Provides relevant follow-up options based on facts
 */
import { FactsPack } from './facts';
import { unitLabel } from '../../data/labels';

/**
 * Chip definition for UI suggestions
 */
export interface ChipSuggestion {
  label: string;
  route: string;
  params: Record<string, any>;
}

/**
 * Generates context-aware chips for consultant brief drill-downs
 * Based on facts extracted from template results
 */
export function chipsFor(facts: FactsPack, templateId: string): ChipSuggestion[] {
  const chips: ChipSuggestion[] = [];
  const metric = facts.metric || 'performance';
  
  // Default time period for drill-downs
  const period = facts.coverage?.window || 'last_12m';
  
  // Add MoM trend analysis chip - always useful
  chips.push({
    label: "MoM trend",
    route: "metric_timeseries_v1",
    params: { 
      period,
      metric
    }
  });
  
  // If we have top performers, add drill-down for the leader
  if (facts.topk?.length) {
    const topUnit = facts.topk[0].name;
    
    // Use unitLabel to provide human-readable BU names
    const displayName = unitLabel(topUnit);
    
    chips.push({
      label: `Why ${displayName}?`,
      route: "metric_snapshot_year_v1",
      params: {
        unit: topUnit,
        metric
      }
    });
  }
  
  // If we have high concentration, add concentration breakdown
  if (facts.concentration?.top3 && facts.concentration.top3 > 0.6) {
    chips.push({
      label: "Concentration by decile",
      route: "metric_breakdown_by_unit_v1",
      params: {
        period,
        metric,
        view: "concentration"
      }
    });
  }
  
  // If we have more than 3 topk entries, add comparative analysis
  if (facts.topk && facts.topk.length > 3) {
    chips.push({
      label: "Compare top performers",
      route: "metric_comparison_v1",
      params: {
        units: facts.topk.slice(0, 3).map(item => item.name).join(','),
        metric
      }
    });
  }
  
  // Add YoY performance chip if we have YoY data
  if (facts.yoY !== undefined && facts.yoY !== null) {
    chips.push({
      label: "YoY performance",
      route: "metric_yoy_comparison_v1",
      params: {
        period,
        metric
      }
    });
  }
  
  // Add margin analysis if the metric is revenue/gross
  if (facts.metric && ['gross', 'revenue', 'sales'].includes(facts.metric.toLowerCase())) {
    chips.push({
      label: "Margin by counterparty",
      route: "margin_analysis_v1",
      params: {
        period
      }
    });
  }
  
  // Risk signals chip
  chips.push({
    label: "Risk signals",
    route: "risk_indicators_v1",
    params: {
      period
    }
  });
  
  return chips;
}
