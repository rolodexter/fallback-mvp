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

  // Greeting/help fallback: always safe to show BU list in Stage-A
  const GREET_RE = /^(hi|hello|hey|howdy|hiya|yo|good\s+(morning|afternoon|evening)|help|start|get started|what can you do)\b/i;
  if (GREET_RE.test(m)) {
    return { domain: "business_units", template_id: "business_units_list_v1", params: {} };
  }

  // Router 2.0: Metrics deterministic routing
  // Lexicon for metrics and synonyms
  const METRIC_ALIASES: Record<string, 'revenue'|'costs'|'gross'> = {
    revenue: 'revenue', sales: 'revenue', turnover: 'revenue',
    cost: 'costs', costs: 'costs', expense: 'costs', expenses: 'costs',
    gross: 'gross'
  };
  const metricKey = Object.keys(METRIC_ALIASES).find(k => m.includes(k));
  const metric = metricKey ? METRIC_ALIASES[metricKey] : undefined;

  // BU code if present, to scope metric if provided
  const bu = m.match(/\b(z0\d{2}|z\d{3})\b/);

  // Years present in the message
  const yearMatches = m.match(/\b(19|20)\d{2}\b/g);
  const years = yearMatches ? yearMatches.map(y => parseInt(y, 10)).slice(0, 2) : [];

  // Trend / timeseries intent
  const wantsTrend = /(trend|trending|trajectory|history|historical|since|over|m\/m|mom|monthly|quarterly|yearly|by\s+month|by\s+quarter|by\s+year)/i.test(m);

  // Granularity detection
  let granularity: 'month'|'quarter'|'year' = 'month';
  if (/quarter|q\d\b|by\s+quarter/i.test(m)) granularity = 'quarter';
  else if (/yearly|annual|by\s+year/i.test(m)) granularity = 'year';

  // If metric trend is requested, route to metric_timeseries_v1
  if (metric && wantsTrend) {
    let from: string | undefined;
    let to: string | undefined;
    const now = new Date();
    const defaultTo = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if (/since\s+(19|20)\d{2}/i.test(m) && years.length >= 1) {
      from = `${years[0]}-01`;
      to = defaultTo;
    } else if (years.length >= 2) {
      const y1 = Math.min(years[0], years[1]);
      const y2 = Math.max(years[0], years[1]);
      from = `${y1}-01`;
      to = `${y2}-12`;
    } else if (years.length === 1) {
      // single year with trend intent => from that year to now
      from = `${years[0]}-01`;
      to = defaultTo;
    } else {
      // default: last 24 months
      const endY = now.getFullYear();
      const endM = now.getMonth()+1;
      const startDate = new Date(endY, endM - 1 - 23, 1);
      from = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`;
      to = `${endY}-${String(endM).padStart(2,'0')}`;
    }
    const params: Record<string, any> = { metric, from, to, granularity };
    if (bu) params.unit = bu[0].toUpperCase();
    return { domain: 'metrics', template_id: 'metric_timeseries_v1', params };
  }

  // Metric snapshot for a specific year, e.g., "costs 2015" or "revenue 2024?"
  if (metric && !wantsTrend) {
    const year = years[0] ?? (new Date().getFullYear() - 1);
    const params: Record<string, any> = { metric, year };
    if (bu) params.unit = bu[0].toUpperCase();
    return { domain: 'metrics', template_id: 'metric_snapshot_year_v1', params };
  }

  // Re-detect BU for BU snapshot routes (variable name reused above for metrics)
  const bu2 = m.match(/\b(z0\d{2}|z\d{3})\b/);
  const monKey = Object.keys(MONTHS_MAP).find(x => m.includes(x));
  const mon = monKey ? MONTHS_MAP[monKey] : undefined;
  if (bu2 && mon && m.includes("snapshot")) {
    // Build first-of-month ISO (YYYY-MM-01)
    const months = [
      'january','february','march','april','may','june','july','august','september','october','november','december'
    ];
    // If a 4-digit year is present in the message, use it; otherwise default to previous year
    const yearMatch = m.match(/\b(20\d{2}|19\d{2})\b/);
    const inferredYear = yearMatch ? parseInt(yearMatch[1], 10) : (new Date().getFullYear() - 1);
    const monthIndex = months.indexOf(mon) + 1;
    const monthIso = `${inferredYear}-${String(monthIndex).padStart(2,'0')}-01`;
    return {
      domain: "business_units",
      template_id: "business_units_snapshot_yoy_v1",
      params: { unit: bu2[0].toUpperCase(), month: monthIso, year: inferredYear }
    };
  }

  // BU snapshot: allow year-only or generic "Z001 snapshot" without month
  if (bu2 && m.includes("snapshot") && !mon) {
    const yearMatch = m.match(/\b(20\d{2}|19\d{2})\b/);
    const inferredYear = yearMatch ? parseInt(yearMatch[1], 10) : (new Date().getFullYear() - 1);
    return {
      domain: "business_units",
      template_id: "business_units_snapshot_yoy_v1",
      params: { unit: bu2[0].toUpperCase(), year: inferredYear }
    };
  }

  // BU year mention like "Z001 2024" (no explicit snapshot/month)
  if (bu2 && !mon) {
    const yearMatch = m.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
      return { domain: "business_units", template_id: "business_units_snapshot_yoy_v1", params: { unit: bu2[0].toUpperCase(), year: parseInt(yearMatch[1], 10) } };
    }
  }

  if (m.includes("counterparties") && (m.includes("ytd") || m.includes("year to date"))) {
    return { domain:"counterparties", template_id:"top_counterparties_gross_v1", params:{ range:"ytd" } };
  }

  // Top counterparties without explicit YTD qualifier
  if ((m.includes("top 3 counterparties") || m.includes("top counterparties")) && !m.includes("ytd") && !m.includes("year to date")) {
    // Default to YTD in Stage-A when not specified
    return { domain: "counterparties", template_id: "top_counterparties_gross_v1", params: { range: "ytd" } };
  }

  // Counterparties synonyms: top customers / largest accounts / concentration
  if (m.includes("top customers") || m.includes("largest accounts") || m.includes("concentration")) {
    return { domain: "counterparties", template_id: "top_counterparties_gross_v1", params: { range: "ytd" } };
  }

  if (
    (m.includes("monthly") && (m.includes("gross") || m.includes("trend"))) ||
    m.includes("trajectory") ||
    m.includes("run-rate") || m.includes("run rate") ||
    m.includes("last 6 months") || m.includes("last six months") ||
    m.includes("trend")
  ) {
    return { domain:"performance", template_id:"monthly_gross_trend_v1", params:{ window:"24m" } };
  }

  // Metric breakdown by business unit
  const BREAKDOWN_PAT = /\b(break\s*down|by\s+bu|by\s+business\s+unit|split\s+by\s+bu)\b/i;
  if (BREAKDOWN_PAT.test(m)) {
    // Extract metric and period from client hints if available
    const params: Record<string, any> = { unit: "ALL" };
    
    // Set default top limit
    params.top = 8;
    
    // Check for specific metric in message
    if (metric) {
      params.metric = metric;
    }
    
    // Add period if year is mentioned
    if (years.length > 0) {
      params.period = { year: years[0] };
    }
    
    return { domain: "metrics", template_id: "metric_breakdown_by_unit_v1", params };
  }
  
  // Business units ranking by importance (top/largest/most important/best performing) OR least important/profitable
  const BU_RANK_BEST_PAT = /\b(most\s+important|top|best|largest|biggest|highest|main|primary|key|critical|strategic|valuable)\b/i;
  const BU_RANK_WORST_PAT = /\b(least|worst|lowest|smallest|weakest|poorest|underperforming)\b/i;
  const BU_SUBJECT_PAT = /\b(business\s+units?|division|bu|bus|lob|department|segment)s?\b/i;
  const PROFIT_METRIC_PAT = /\b(profit|profitable|margin|revenue|earning|income)\b/i;
  const TEMPORAL_PAT = /\b(ever|all[\s-]time|history|historical|of all time)\b/i;
  
  // Match explicit BU ranking OR profit/revenue ranking (which implies BUs)
  if ((BU_RANK_BEST_PAT.test(m) || BU_RANK_WORST_PAT.test(m)) && 
      (BU_SUBJECT_PAT.test(m) || (PROFIT_METRIC_PAT.test(m) && !m.includes("margin by")))) {
    // Determine if looking for best or worst performers
    const isDescending = BU_RANK_BEST_PAT.test(m); // true = highest first, false = lowest first
    
    // Determine metric based on query content
    let sortMetric = 'revenue';
    if (m.includes('profit') || m.includes('margin') || m.includes('profitable')) {
      sortMetric = 'gross';
    } else if (m.includes('cost') || m.includes('expense')) {
      sortMetric = 'costs';
    }
    
    return { 
      domain: "business_units", 
      template_id: "business_units_ranking_v1", 
      params: { 
        metric: sortMetric,
        limit: 3, // Show top 3 by default
        sort: isDescending ? 'desc' : 'asc', // Sort direction based on query
        year: new Date().getFullYear() - 1,
        showDetails: true,
        context_request: isDescending ? 'top_performers' : 'underperformers'
      } 
    };
  }

  // Business units list (broad phrasing): business units / divisions / lines of business / LOB
  const BU_LIST_PAT = /\b(business\s+units?|divisions?|lines?\s+of\s+business|lob?s?)\b/i;
  if (BU_LIST_PAT.test(m)) {
    return { domain: "business_units", template_id: "business_units_list_v1", params: {} };
  }

  // Synonym: list all business units -> explicit BU list template id
  if (m.includes("list") && (m.includes("business units") || m.includes("bus"))) {
    return { domain: "business_units", template_id: "business_units_list_v1", params: {} };
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
  
  // Business risk assessment and weakness queries - common in executive questions
  const RISK_WEAKNESS_PAT = /\b(risk|risks|weak|weakness|weaknesses|threat|threats|concern|concerns|problem|problems|issue|issues|challenge|challenges|struggling|underperform|exposure|vulnerabilit|opportunit)\b/i;
  if (RISK_WEAKNESS_PAT.test(m) && (m.includes("business") || m.includes("company") || m.includes("organization") || m.includes("enterprise"))) {
    // Route to our specialized business risk assessment template
    // This provides a multi-metric view focusing on underperforming areas
    return { 
      domain: "risk", 
      template_id: "business_risk_assessment_v1", 
      params: { 
        year: new Date().getFullYear() - 1,
        limit: 10 // Show top 10 risk areas by default
      } 
    };
  }
  
  // More general open-ended strategic questions
  const STRATEGIC_PAT = /\b(where|what|how)\b.*\b(start|focus|prioritize|attention|look|address)\b/i;
  if (STRATEGIC_PAT.test(m) && !RISK_WEAKNESS_PAT.test(m)) {
    // Default to business units overview for open-ended strategic questions
    return { domain: "business_units", template_id: "business_units_list_v1", params: { includePerformance: true } };
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

  // Metrics fallback: default to snapshot if only domain detected
  if (domain === 'metrics') {
    return { domain, template_id: 'metric_snapshot_year_v1', params: {} };
  }
  
  // Default to domain-named template if exists
  return { domain, template_id: `${domain}_v1`, params: {} };
}
