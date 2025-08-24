/**
 * Test script to verify Stage-A canonical prompts end-to-end
 * Copy and paste into browser console
 */

// Function to test canonical prompt
async function testCanonicalPrompt(message) {
  console.log(`\n===== TESTING CANONICAL PROMPT: "${message}" =====\n`);
  
  // Step 1: Route message
  const { routeMessage } = window.require('./data/router/router');
  const { routeToTemplate } = window.require('./data/router/topicRouter');
  
  const routerResult = routeMessage(message);
  console.log('Router result:', routerResult);
  
  const templateResult = routeToTemplate(routerResult, message);
  console.log('Template result:', templateResult);
  
  // Step 2: Prepare API call
  const { domain, template_id, params } = templateResult;
  const payload = {
    message,
    router: { domain },
    template: { id: template_id },
    params
  };
  console.log('API payload:', payload);
  
  // Step 3: Make API call
  try {
    console.log('Making API call...');
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('API response:', data);
    
    // Validate response shape
    console.log('✅ Response has text field:', !!data.text);
    console.log('✅ Response has mode="strict":', data.mode === 'strict');
    console.log('✅ Response has provenance.source="mock":', data.provenance?.source === 'mock');
    console.log('✅ Response has meta.domain:', data.meta?.domain);
    console.log('✅ Response has KPIs:', !!data.kpis && Object.keys(data.kpis).length > 0);
    
    return data;
  } catch (error) {
    console.error('Error testing canonical prompt:', error);
    return null;
  }
}

// Test all three canonical prompts
async function runTests() {
  const canonicalPrompts = [
    'Z001 June snapshot',
    'Top counterparties YTD',
    'Monthly gross trend'
  ];
  
  for (const prompt of canonicalPrompts) {
    await testCanonicalPrompt(prompt);
  }
  
  console.log('\n✅ All tests completed');
}

// Run the tests
runTests().catch(console.error);
