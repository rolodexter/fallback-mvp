/**
 * Test Script for Metric Breakdown by Business Unit Feature
 * 
 * This script helps verify the functionality of the metric breakdown feature:
 * 1. Routing detection for "break down by business unit" queries
 * 2. Slot-filling for missing metric and period parameters
 * 3. "Show all" functionality
 * 4. UI table rendering with right-aligned numerics and bar charts
 */

console.log('====== METRIC BREAKDOWN FEATURE TEST ======');

// Test basic routing with complete parameters
async function testBreakdownRouting() {
  console.log('\n--- 1. Testing Breakdown Routing (Complete Parameters) ---');
  const message = 'Break down revenue by business unit for this year';
  
  try {
    if (!window.chatClient) {
      console.error('❌ Chat client not available');
      return { success: false, error: 'Chat client not available' };
    }

    const response = await window.chatClient.sendChat(message, []);
    
    console.log('Response:', response);
    
    // Check if response contains a table widget
    const hasTableWidget = response.widgets && 
                          Array.isArray(response.widgets) && 
                          response.widgets.some(w => w.type === 'table' || w.kind === 'table');
    
    // Check if breakdown was mentioned in the response
    const mentionsBreakdown = response.text && 
                            (response.text.toLowerCase().includes('breakdown') || 
                             response.text.toLowerCase().includes('by business unit'));
    
    // Check if the domain/template is correct
    const correctTemplate = response.meta && 
                           response.meta.domain === 'metric_breakdown_by_unit_v1';
    
    return {
      success: hasTableWidget && mentionsBreakdown,
      hasTableWidget,
      mentionsBreakdown,
      correctTemplate,
      response
    };
  } catch (error) {
    console.error('❌ Error testing breakdown routing:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Test slot-filling for missing metric
async function testBreakdownMissingMetric() {
  console.log('\n--- 2. Testing Breakdown with Missing Metric ---');
  const message = 'Break down by business unit';
  
  try {
    if (!window.chatClient) {
      console.error('❌ Chat client not available');
      return { success: false, error: 'Chat client not available' };
    }

    const response = await window.chatClient.sendChat(message, []);
    
    console.log('Response:', response);
    
    // Check if it's a clarification response
    const isClarification = response.mode === 'clarify';
    
    // Check if it asks for metric specifically
    const asksForMetric = response.text && 
                         response.text.toLowerCase().includes('metric') &&
                         response.clarify &&
                         response.clarify.suggestions &&
                         response.clarify.suggestions.metric;
    
    return {
      success: isClarification && asksForMetric,
      isClarification,
      asksForMetric,
      response
    };
  } catch (error) {
    console.error('❌ Error testing breakdown with missing metric:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Test "Show all" functionality
async function testBreakdownShowAll() {
  console.log('\n--- 3. Testing "Show All" Functionality ---');
  
  try {
    if (!window.chatClient) {
      console.error('❌ Chat client not available');
      return { success: false, error: 'Chat client not available' };
    }

    // First send a regular breakdown query
    const initialMessage = 'Break down revenue by business unit';
    const initialResponse = await window.chatClient.sendChat(initialMessage, []);
    
    console.log('Initial response received');
    
    // Now send a followup to show all
    const followupMessage = 'Show all business units';
    const params = { showAllUnits: true };
    const followupResponse = await window.chatClient.sendChat(followupMessage, [], params);
    
    console.log('Followup response:', followupResponse);
    
    // Check if the followup has more business units
    const initialBuCount = getBusinessUnitCount(initialResponse);
    const followupBuCount = getBusinessUnitCount(followupResponse);
    
    console.log(`Initial BU count: ${initialBuCount}, Followup BU count: ${followupBuCount}`);
    
    return {
      success: followupBuCount > initialBuCount,
      initialBuCount,
      followupBuCount,
      response: followupResponse
    };
  } catch (error) {
    console.error('❌ Error testing "Show All" functionality:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Helper function to count business units in response
function getBusinessUnitCount(response) {
  try {
    if (!response || !response.widgets) return 0;
    
    // Find table widget
    const tableWidget = response.widgets.find(w => w.type === 'table' || w.kind === 'table');
    if (!tableWidget) return 0;
    
    // Count rows in the table
    return tableWidget.rows ? tableWidget.rows.length : 0;
  } catch (e) {
    console.error('Error counting BUs:', e);
    return 0;
  }
}

// Run all tests
async function runBreakdownTests() {
  console.log('====== STARTING METRIC BREAKDOWN TESTS ======');
  
  const routingResult = await testBreakdownRouting();
  console.log(routingResult.success ? 
    '✅ Breakdown routing OK' : 
    '❌ Breakdown routing FAILED');
  
  const missingMetricResult = await testBreakdownMissingMetric();
  console.log(missingMetricResult.success ? 
    '✅ Clarification for missing metric OK' : 
    '❌ Clarification for missing metric FAILED');
  
  const showAllResult = await testBreakdownShowAll();
  console.log(showAllResult.success ? 
    '✅ Show All functionality OK' : 
    '❌ Show All functionality FAILED');
  
  console.log('\n====== METRIC BREAKDOWN TEST SUMMARY ======');
  console.log(`Breakdown routing: ${routingResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Missing metric clarification: ${missingMetricResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Show All functionality: ${showAllResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  
  return {
    routing: routingResult,
    missingMetric: missingMetricResult,
    showAll: showAllResult
  };
}

// Make functions available globally
window.testBreakdownRouting = testBreakdownRouting;
window.testBreakdownMissingMetric = testBreakdownMissingMetric;
window.testBreakdownShowAll = testBreakdownShowAll;
window.runBreakdownTests = runBreakdownTests;

console.log('\n🚀 Metric Breakdown test script loaded! Run tests with: runBreakdownTests()');
