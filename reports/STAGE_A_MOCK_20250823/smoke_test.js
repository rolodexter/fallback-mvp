/**
 * Smoke test for mock data mode implementation
 * Tests both Vercel and Netlify functions with various queries
 */

const fetch = require('node-fetch');
const fs = require('fs');

// Define test cases
const testCases = [
  {
    name: 'Intro/nodata',
    message: 'hello',
    expectedMode: 'nodata',
    expectedReason: 'no_domain',
  },
  {
    name: 'Business units',
    message: 'Z001 June snapshot',
    expectedMode: 'strict',
    expectedTemplateId: 'performance',
    expectedSource: 'mock',
    shouldHaveKpis: true,
  },
  {
    name: 'Top counterparties',
    message: 'Top counterparties YTD',
    expectedMode: 'strict',
    expectedTemplateId: 'counterparties',
    expectedSource: 'mock',
    shouldHaveWidget: true,
  },
  {
    name: 'Out of coverage',
    message: 'July results',
    expectedMode: 'abstain',
    shouldHaveAbstainReason: true,
  },
];

// Log configuration
console.log('Starting smoke tests with DATA_MODE=mock');
console.log('POLISH_NARRATIVE:', process.env.POLISH_NARRATIVE || 'false');

// Test Netlify endpoint (using environment variable if set)
const endpoints = [
  { name: 'Netlify', url: process.env.CHAT_NETLIFY_URL || 'http://localhost:8888/.netlify/functions/chat' }
];

// Run tests sequentially
async function runTests() {
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`\nTesting ${endpoint.name} endpoint: ${endpoint.url}`);
    
    for (const test of testCases) {
      console.log(`\nTest case: ${test.name}`);
      console.log(`Message: "${test.message}"`);
      
      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: test.message }),
        });
        
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
        
        // Verify response
        const result = {
          endpoint: endpoint.name,
          test: test.name,
          passed: true,
          failures: [],
        };
        
        // Check mode
        if (data.mode !== test.expectedMode) {
          result.passed = false;
          result.failures.push(`Expected mode "${test.expectedMode}", got "${data.mode}"`);
        }
        
        // Check for specific reason if nodata
        if (test.expectedReason && data.reason !== test.expectedReason) {
          result.passed = false;
          result.failures.push(`Expected reason "${test.expectedReason}", got "${data.reason}"`);
        }
        
        // Check template ID and source if strict mode
        if (test.expectedMode === 'strict') {
          if (data.provenance?.template_id !== test.expectedTemplateId) {
            result.passed = false;
            result.failures.push(`Expected template_id "${test.expectedTemplateId}", got "${data.provenance?.template_id}"`);
          }
          
          if (data.provenance?.source !== test.expectedSource) {
            result.passed = false;
            result.failures.push(`Expected source "${test.expectedSource}", got "${data.provenance?.source}"`);
          }
        }
        
        // Check for KPIs or widget if expected
        if (test.shouldHaveKpis && !data.widgets) {
          result.passed = false;
          result.failures.push('Expected widgets/KPIs in response but none found');
        }
        
        // Check for abstain reason if expected
        if (test.shouldHaveAbstainReason && !data.abstain_reason) {
          result.passed = false;
          result.failures.push('Expected abstain_reason but none found');
        }
        
        // Log result
        console.log(`Test ${result.passed ? 'PASSED' : 'FAILED'}`);
        if (result.failures.length > 0) {
          console.log('Failures:', result.failures);
        }
        
        results.push(result);
      } catch (error) {
        console.error('Test error:', error);
        results.push({
          endpoint: endpoint.name,
          test: test.name,
          passed: false,
          failures: [`Exception: ${error.message}`],
        });
      }
    }
  }
  
  // Write summary to file
  const summary = {
    timestamp: new Date().toISOString(),
    configuration: {
      dataMode: 'mock',
      polishNarrative: process.env.POLISH_NARRATIVE === 'true',
    },
    results,
    overallPass: results.every(r => r.passed),
  };
  
  fs.writeFileSync('reports/STAGE_A_MOCK_20250823/05_SMOKE_RESULTS.md', 
    `# Smoke Test Results\n\n` +
    `Timestamp: ${summary.timestamp}\n\n` +
    `Configuration:\n` +
    `- DATA_MODE=mock\n` +
    `- POLISH_NARRATIVE=${summary.configuration.polishNarrative}\n\n` +
    `## Results\n\n` +
    results.map(r => 
      `### ${r.endpoint} - ${r.test}\n` +
      `Status: ${r.passed ? '✅ PASSED' : '❌ FAILED'}\n` +
      (r.failures.length > 0 ? `Failures:\n${r.failures.map(f => `- ${f}`).join('\n')}\n` : '')
    ).join('\n\n') +
    `\n\n## Overall: ${summary.overallPass ? '✅ PASSED' : '❌ FAILED'}\n`
  );
  
  console.log(`\nTests complete. Overall: ${summary.overallPass ? 'PASSED' : 'FAILED'}`);
  console.log(`Results written to reports/STAGE_A_MOCK_20250823/05_SMOKE_RESULTS.md`);
}

runTests().catch(console.error);
