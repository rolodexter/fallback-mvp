/**
 * Router module for determining the domain of a message
 * Uses keyword matching to assign a domain and confidence score
 */

import keywords from './keywords.json';

export type RouterResult = {
  domain: string;
  confidence: number;
};

/**
 * Simple router implementation that scores domain matches based on keyword presence
 * @param message The user message to analyze
 * @returns Object with domain and confidence score
 */
export function routeMessage(message: string): RouterResult {
  if (!message) {
    return { domain: 'none', confidence: 0 };
  }

  const messageLower = message.toLowerCase();
  const results: Record<string, number> = {};
  const domains = Object.keys(keywords);

  // Calculate scores for each domain
  for (const domain of domains) {
    let score = 0;
    const domainKeywords = (keywords as any)[domain] as string[];
    
    for (const keyword of domainKeywords) {
      // Exact phrase matches get higher weight
      if (messageLower.includes(keyword.toLowerCase())) {
        // Phrase match
        score += 0.2;
      } else {
        // Check for individual word matches
        const words = keyword.toLowerCase().split(' ');
        for (const word of words) {
          if (word.length > 3 && messageLower.includes(word)) {
            score += 0.1;
          }
        }
      }
    }
    
    results[domain] = score;
  }

  // Find highest scoring domain
  let highestDomain = 'none';
  let highestScore = 0;

  for (const domain in results) {
    if (results[domain] > highestScore) {
      highestDomain = domain;
      highestScore = results[domain];
    }
  }

  // Return 'none' if confidence threshold not met
  if (highestScore < 0.3) {
    return { domain: 'none', confidence: highestScore };
  }

  // Update debug info if available
  if (typeof window !== 'undefined' && window.__riskillDebug) {
    window.__riskillDebug.routerDomain = highestDomain;
    window.__riskillDebug.routerConfidence = highestScore;
    window.__riskillDebug.templateId = highestDomain !== 'none' ? highestDomain : '';
  }

  return { domain: highestDomain, confidence: highestScore };
}
