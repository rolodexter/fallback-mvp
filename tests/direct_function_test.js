// Direct test of the chat function without requiring a running server
// Ensure environment is loaded
require('dotenv').config();

// Debug information
console.log('Environment variables check:');
console.log('DATA_MODE:', process.env.DATA_MODE || 'not set');
console.log('LLM_PROVIDER:', process.env.LLM_PROVIDER || 'not set');
console.log('ENABLE_MULTI_STEP:', process.env.ENABLE_MULTI_STEP || 'not set (defaults to true)');
console.log('PERPLEXITY_API_KEY exists:', Boolean(process.env.PERPLEXITY_API_KEY));
console.log('----------------------------');

// Load the chat module
let chatModule;
try {
  chatModule = require('../netlify/functions/chat');
  console.log('Chat module loaded successfully');
} catch (err) {
  console.error('Error loading chat function:', err);
  process.exit(1);
}

// Test configuration
const QUERY = 'Show me the performance of liferafts business unit';
console.log(`Testing multi-step prompting with query: "${QUERY}"`);

// Create mock event and context objects for the Netlify function
const mockEvent = {
  httpMethod: 'POST',
  body: JSON.stringify({
    message: QUERY,
    grounding: {
      domain: 'financial'
    }
  }),
  headers: {
    'content-type': 'application/json',
    'x-request-id': `test-${Date.now()}`
  }
};

const mockContext = {
  functionName: 'chat',
  functionVersion: '1.0'
};

// Execute the function directly
async function runTest() {
  console.log('Starting direct function test...');
  console.time('Function execution');
  
  try {
    const response = await chatModule.handler(mockEvent, mockContext);
    console.timeEnd('Function execution');
    
    // Check status code
    console.log(`Status code: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      // Parse response body
      const body = JSON.parse(response.body);
      
      // Log response details
      console.log('\n===== TEST RESULTS =====');
      console.log(`✅ Answer type: ${body.type}`);
      console.log(`✅ Provenance: ${body.provenance || 'none'}`);
      
      // Log answer preview
      const answerPreview = body.answer.substring(0, 300);
      console.log(`\nAnswer preview (first 300 chars):\n${answerPreview}...`);
      
      // Check for widgets
      if (body.widgets && Object.keys(body.widgets).length > 0) {
        console.log(`\n✅ Widgets found: ${Object.keys(body.widgets).length}`);
        console.log('Widget types:', Object.keys(body.widgets).join(', '));
      } else {
        console.log(`\n⚠️ No widgets in response`);
      }
      
      // Save full response to file
      const fs = require('fs');
      fs.writeFileSync('tests/direct_test_response.json', JSON.stringify(body, null, 2));
      console.log('\nFull response saved to tests/direct_test_response.json');
      
      console.log('\n✅ Test completed successfully');
    } else {
      console.error(`Error: ${response.statusCode}`);
      console.error(`Response body: ${response.body}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
