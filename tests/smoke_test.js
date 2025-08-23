/**
 * Smoke Test Script for Generic LLM Response Fix
 * 
 * This script helps verify the critical functionality after applying fixes
 * Run this script in the browser console to check:
 * 1. Platform detection
 * 2. Environment variable detection
 * 3. Chat functionality
 * 4. Response grounding
 */

// Enable detailed logging
console.log('====== RUNNING SMOKE TESTS ======');
console.log('Starting smoke test verification...');

// 1. Check platform detection
function testPlatformDetection() {
  console.log('\n--- 1. Testing Platform Detection ---');
  const platform = window.__riskillDebug?.platform;
  console.log(`Platform detected: ${platform || 'None'}`);
  const endpoint = window.__riskillDebug?.endpoint;
  console.log(`Endpoint selected: ${endpoint || 'None'}`);
  
  return {
    success: !!platform && !!endpoint,
    platform,
    endpoint
  };
}

// 2. Check chat client initialization
function testChatClientInitialization() {
  console.log('\n--- 2. Testing Chat Client Initialization ---');
  
  if (!window.chatClient) {
    console.error('❌ Chat client not found on window object');
    return { success: false };
  }
  
  const initialized = window.chatClient.initialized;
  const endpoint = window.chatClient.endpoint;
  
  console.log(`Chat client initialized: ${initialized}`);
  console.log(`Chat client endpoint: ${endpoint}`);
  
  return {
    success: initialized && !!endpoint,
    initialized,
    endpoint
  };
}

// 3. Test a simple chat message (to run manually)
async function testChatMessage(message = 'How is our revenue trending?') {
  console.log('\n--- 3. Testing Chat Message ---');
  console.log(`Sending test message: "${message}"`);
  
  try {
    if (!window.chatClient) {
      console.error('❌ Chat client not available on window object');
      return { success: false, error: 'Chat client not available' };
    }

    const startTime = new Date();
    const response = await window.chatClient.sendChat(message, []);
    const endTime = new Date();
    const responseTime = endTime - startTime;
    
    console.log(`Response received in ${responseTime}ms`);
    console.log('Response:', response);
    
    // Check if the response contains typical indicators of grounded responses
    const hasGroundedIndicators = 
      response.text && 
      (response.text.includes('data') || 
       response.text.includes('revenue') || 
       response.text.includes('financial') ||
       (response.meta && response.meta.domain));
    
    return {
      success: !!response.text && response.text.length > 50,
      responseTime,
      hasGroundedIndicators,
      response
    };
  } catch (error) {
    console.error('❌ Error testing chat:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// 4. Verify environment variables (server-side only, can't test directly in browser)
function checkEnvironmentSetup() {
  console.log('\n--- 4. Environment Variables Check ---');
  console.log('⚠️ Note: Environment variables can only be verified server-side.');
  console.log('Check for any error responses when sending chat messages that might indicate missing variables.');
  
  return {
    note: 'Manual verification required'
  };
}

// Run tests
async function runAllTests() {
  console.log('====== STARTING SMOKE TESTS ======');
  
  const platformResult = testPlatformDetection();
  console.log(platformResult.success ? '✅ Platform detection OK' : '❌ Platform detection FAILED');
  
  const clientResult = testChatClientInitialization();
  console.log(clientResult.success ? '✅ Chat client initialization OK' : '❌ Chat client initialization FAILED');
  
  console.log('\n🧪 To test a chat message, run this in console:');
  console.log('testChatMessage("How is our revenue trending?").then(r => console.log(r.success ? "✅ SUCCESS" : "❌ FAILED"))');
  
  checkEnvironmentSetup();
  
  console.log('\n====== SMOKE TEST SUMMARY ======');
  console.log(`Platform detection: ${platformResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Chat client init: ${clientResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('Chat messaging: 🧪 Run manually with testChatMessage()');
  console.log('Environment variables: 🧪 Verify manually on server');
  
  return {
    platformDetection: platformResult,
    chatClientInitialization: clientResult
  };
}

// Make functions available globally
window.testPlatformDetection = testPlatformDetection;
window.testChatClientInitialization = testChatClientInitialization;
window.testChatMessage = testChatMessage;
window.checkEnvironmentSetup = checkEnvironmentSetup;
window.runAllTests = runAllTests;

console.log('\n🚀 Smoke test script loaded! Run tests with: runAllTests()');
