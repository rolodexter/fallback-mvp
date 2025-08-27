/**
 * Placeholder fill and numeric guard for consultant briefs
 * Ensures deterministic values only in narrative text
 */
import { FactsPack } from './facts';

/**
 * Fills placeholders in a skeleton text with values from FactsPack
 * Simple string replacement for templating
 */
export function fillPlaceholders(skeleton: string, facts: FactsPack): string {
  let filled = skeleton;
  
  // Create a mapping of all fact values for replacement
  const replacements: Record<string, string> = {};
  
  // Flatten the facts object for simple replacement
  function flattenObject(obj: any, prefix = '') {
    for (const key in obj) {
      if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        flattenObject(obj[key], `${prefix}${key}.`);
      } else if (!Array.isArray(obj[key])) {
        const value = obj[key];
        replacements[`{${prefix}${key}}`] = value !== undefined && value !== null ? String(value) : '{n/a}';
      }
    }
  }
  
  // Add basic facts as replacements
  flattenObject(facts);
  
  // Special handling for arrays like topk
}

/**
 * Extracts all numeric tokens from text
 */
function extractNumbers(text: string): string[] {
  const m = text.match(/[-+]?\d[\d,]*(?:\.\d+)?%/g) || [];
  const m2 = text.match(/[-+]?\d[\d,]*(?:\.\d+)?/g) || [];
  return Array.from(new Set([...m, ...m2]));
}

function whitelistFromFacts(f: FactsPack): Set<string> {
  const s = new Set<string>();
  const push = (x?: number | null) => {
    if (x == null) return;
    s.add(fmtNum(x));
    s.add(String(x));
    // percent encodings
    const p = Math.abs(x) <= 1 ? x * 100 : x;
    s.add(`${Number(p).toFixed(2)}%`);
    s.add(`${Math.round(p)}%`);
  };
  push(f.yoY ?? null);
  push(f.slope ?? null);
  if (f.concentration?.top1 != null) push(f.concentration.top1);
  if (f.concentration?.top3 != null) push(f.concentration.top3);
  for (const r of f.topk ?? []) push(r.value);
  // Also allow numbers that appear inside the period label (years)
  for (const y of (f.period_label.match(/\d{4}/g) || [])) s.add(y);
  return s;
}

/**
 * Guards against new numbers in polished narrative
 * Ensures all numeric values came from facts or standard values
 */
export function guardNoNewNumbers(text: string, facts: FactsPack): boolean {
  // Extract all numbers from the text
  const textNumbers = extractNumbers(text);
  
  // Generate whitelist of allowed numbers
  const whitelist = generateNumberWhitelist(facts);
  
  // Check if all numbers in text are in the whitelist
  for (const num of textNumbers) {
    // Skip common safe patterns
    if (num === '0' || num === '1' || num === '2' || num === '3' || num === '100%') continue;
    
    // Check against whitelist
    if (!whitelist.has(num)) {
      console.warn(`[guard] Rejected non-whitelisted number: ${num}`);
      return false;
    }
  }
  
  return true;
}
