// Test script for multi-step prompting with business unit query
const fetch = require('node-fetch');

// Configuration
const LOCAL_ENDPOINT = 'http://localhost:8888/.netlify/functions/chat';
const QUERY = 'Show me the performance of liferafts business unit';
const TIMEOUT_MS = 60000; // 60 seconds timeout

// Test function
async function testMultiStepPrompting() {
  console.log('Running multi-step prompting test with business unit query...');
  console.log(`Query: "${QUERY}"`);
  
  const payload = {
    message: QUERY,
    grounding: {
      domain: 'financial' // Set domain for better context
    }
  };
  
  console.log('Sending request...');
  const startTime = Date.now();

  try {
    const response = await fetch(LOCAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: TIMEOUT_MS
    });
    
    const endTime = Date.now();
    const responseTimeMs = endTime - startTime;
    
    if (!response.ok) {
      console.error(`Error: ${response.status} - ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Response body: ${errorText}`);
      process.exit(1);
    }
    
    const result = await response.json();
    
    console.log(`\n===== TEST RESULTS =====`);
    console.log(`✅ Response received in ${responseTimeMs}ms`);
    console.log(`✅ Answer type: ${result.type}`);
    console.log(`✅ Provenance: ${result.provenance || 'none'}`);
    
    // Log truncated answer text
    const answerPreview = result.answer.substring(0, 300);
    console.log(`\nAnswer preview (first 300 chars):\n${answerPreview}...`);
    
    // Check if there are any widgets
    if (result.widgets && Object.keys(result.widgets).length > 0) {
      console.log(`\n✅ Widgets found: ${Object.keys(result.widgets).length}`);
    } else {
      console.log(`\n⚠️ No widgets in response`);
    }
    
    // Display full answer for debugging
    console.log('\nFull answer:');
    console.log(result.answer);
    
    return true;
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
    return false;
  }
}

// Run test
testMultiStepPrompting().then(success => {
  if (success) {
    console.log('\n✅ Test completed successfully');
  } else {
    console.error('\n❌ Test failed');
    process.exit(1);
  }
});
