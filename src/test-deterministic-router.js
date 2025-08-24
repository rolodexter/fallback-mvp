// Test script for deterministic router
// This verifies the Stage-A canonical prompt routing requirements

import { routeMessage } from './data/router/topicRouter';

// Test canonical prompts
console.log('\n=== Testing Deterministic Router for Stage-A Canonical Prompts ===\n');

// Test Canonical Prompt #1: Z001 June snapshot
const test1 = routeMessage('Z001 June snapshot');
console.log('Test 1: "Z001 June snapshot"');
console.log('Expected: business_units_snapshot_yoy_v1');
console.log('Result:', JSON.stringify(test1, null, 2));
console.log('Success:', test1.template_id === 'business_units_snapshot_yoy_v1');

// Test Canonical Prompt #2: Top counterparties YTD
const test2 = routeMessage('Top counterparties YTD');
console.log('\nTest 2: "Top counterparties YTD"');
console.log('Expected: top_counterparties_gross_v1');
console.log('Result:', JSON.stringify(test2, null, 2));
console.log('Success:', test2.template_id === 'top_counterparties_gross_v1');

// Test Canonical Prompt #3: Monthly gross trend
const test3 = routeMessage('Monthly gross trend');
console.log('\nTest 3: "Monthly gross trend"');
console.log('Expected: monthly_gross_trend_v1');
console.log('Result:', JSON.stringify(test3, null, 2));
console.log('Success:', test3.template_id === 'monthly_gross_trend_v1');

// Test variations
console.log('\n=== Testing Variations ===\n');

// Test variation for BU code + month + snapshot
const testVar1 = routeMessage('Show me the Z002 May snapshot please');
console.log('Test Variation 1: "Show me the Z002 May snapshot please"');
console.log('Expected: business_units_snapshot_yoy_v1');
console.log('Result:', JSON.stringify(testVar1, null, 2));
console.log('Success:', testVar1.template_id === 'business_units_snapshot_yoy_v1');

// Test variation for counterparties with "year to date"
const testVar2 = routeMessage('Can you show top counterparties year to date?');
console.log('\nTest Variation 2: "Can you show top counterparties year to date?"');
console.log('Expected: top_counterparties_gross_v1');
console.log('Result:', JSON.stringify(testVar2, null, 2));
console.log('Success:', testVar2.template_id === 'top_counterparties_gross_v1');

// Test variation for monthly trend
const testVar3 = routeMessage('What is our monthly gross?');
console.log('\nTest Variation 3: "What is our monthly gross?"');
console.log('Expected: monthly_gross_trend_v1');
console.log('Result:', JSON.stringify(testVar3, null, 2));
console.log('Success:', testVar3.template_id === 'monthly_gross_trend_v1');

// Test non-matching query
const testNonMatch = routeMessage('What is the weather like today?');
console.log('\nTest Non-Matching: "What is the weather like today?"');
console.log('Expected: {}');
console.log('Result:', JSON.stringify(testNonMatch, null, 2));
console.log('Success:', Object.keys(testNonMatch).length === 0);

console.log('\n=== Test Summary ===');
console.log('All canonical prompts should be correctly routed to their respective templates.');
console.log('If all tests show Success: true, the deterministic router is working as required.');
