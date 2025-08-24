/**
 * Router module for determining the domain of a message
 * Uses keyword matching to assign a domain and confidence score
 */

import keywords from './keywords';

// Global debug interface is defined in src/services/chatClient.ts

export type RouterResult = {
  domain: string;
  confidence: number;
};

export type TopicDetectionResult = {
  domain: string;
  confidence: number;
  groundingType: "intro" | "drilldown" | "no_data" | null;
};

/**
 * Route a message to a specific domain based on keyword matching
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

/**
 * Detect the topic and grounding type from a user message
 * @param message The user message to analyze
 * @returns Object with domain, confidence, and groundingType
 */
export function detectTopic(message: string): TopicDetectionResult {
  // Get the basic domain detection
  const { domain, confidence } = routeMessage(message);
  
  // Default to intro for high-level questions, drilldown for specifics
  let groundingType: "intro" | "drilldown" | "no_data" | null = null;
  
  if (domain === 'none') {
    return { domain, confidence, groundingType: null };
  }
  
  const messageLower = message.toLowerCase();
  
  // Determine grounding type based on message content
  if (
    messageLower.includes('trend') ||
    messageLower.includes('compare') ||
    messageLower.includes('versus') ||
    messageLower.includes('vs') ||
    messageLower.includes('detail') ||
    messageLower.includes('specific') ||
    messageLower.match(/how (much|many)/) ||
    messageLower.includes('numbers') ||
    messageLower.includes('statistics')
  ) {
    groundingType = 'drilldown';
  } else {
    // Default to intro for more general questions
    groundingType = 'intro';
  }
  
  // Update debug info
  if (typeof window !== 'undefined' && window.__riskillDebug) {
    window.__riskillDebug.routerGroundingType = groundingType;
  }
  
  return { domain, confidence, groundingType };
}
