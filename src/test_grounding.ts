/**
 * Test script for the grounded chat implementation
 * 
 * This script tests the following scenarios:
 * 1. Performance domain detection and grounding
 * 2. Counterparties domain detection and grounding
 * 3. Risk domain detection and grounding
 * 4. Low confidence handling
 */

import { detectTopic } from './data/router/router';
import { runTemplate } from './data/templates';

// Make sure we're in Node environment
console.log('Starting tests...');

// Test cases
const testCases = [
  {
    name: 'Performance Domain - Intro',
    message: 'How has our performance been recently?',
    expectedDomain: 'performance',
    expectedGroundingType: 'intro'
  },
  {
    name: 'Performance Domain - Drilldown',
    message: 'Can you give me details about the Navigation business unit performance?',
    expectedDomain: 'performance',
    expectedGroundingType: 'drilldown'
  },
  {
    name: 'Counterparties Domain - Intro',
    message: 'Who are our top counterparties?',
    expectedDomain: 'counterparties',
    expectedGroundingType: 'intro'
  },
  {
    name: 'Counterparties Domain - Drilldown',
    message: 'What percentage of our business comes from ACME Corp?',
    expectedDomain: 'counterparties',
    expectedGroundingType: 'drilldown'
  },
  {
    name: 'Risk Domain - Intro',
    message: 'What are our main risk factors?',
    expectedDomain: 'risk',
    expectedGroundingType: 'intro'
  },
  {
    name: 'Risk Domain - Drilldown',
    message: 'Tell me more about our supply chain risks',
    expectedDomain: 'risk',
    expectedGroundingType: 'drilldown'
  },
  {
    name: 'Low Confidence',
    message: 'What is the weather like today?',
    expectedDomain: 'none',
    expectedGroundingType: null
  }
];

// Part 1: Run router tests
console.log('\n====== ROUTER DETECTION TESTS ======');
for (const test of testCases) {
  try {
    const result = detectTopic(test.message);
    const passed = result.domain === test.expectedDomain && 
                  result.groundingType === test.expectedGroundingType;
    
    console.log(`${passed ? '✅' : '❌'} ${test.name}`);
    console.log(`  Message: "${test.message}"`);
    console.log(`  Expected: domain=${test.expectedDomain}, groundingType=${test.expectedGroundingType}`);
    console.log(`  Actual:   domain=${result.domain}, groundingType=${result.groundingType}`);
    console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
    console.log('');
  } catch (error) {
    console.error(`Error testing ${test.name}:`, error);
  }
}

// Part 2: Test template generation
console.log('\n====== TEMPLATE GENERATION TESTS ======');
const domains = ['performance', 'counterparties', 'risk'];
for (const domain of domains) {
  try {
    console.log(`\nTemplate for domain: ${domain}`);
    const template = runTemplate(domain, {});
    template.then(result => {
      console.log(`KPI Summary: ${result.kpiSummary}\nTemplate Output:\n${result.templateOutput}`);
    });
  } catch (error) {
    console.error(`Error generating template for ${domain}:`, error);
  }
}

// Part 3: Manual test instructions
console.log('\n====== MANUAL TESTING INSTRUCTIONS ======');
console.log('To test the full chat flow:');
console.log('1. Open the application in a browser');
console.log('2. Try these test messages in the chat:');
console.log('   - "How has our performance been recently?"');
console.log('   - "Who are our top counterparties?"');
console.log('   - "What are our main risk factors?"');
console.log('   - "What is the weather like today?" (should handle low confidence)');
console.log('\nTests completed. Check console for any errors.');

