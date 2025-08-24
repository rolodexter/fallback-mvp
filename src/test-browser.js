/**
 * Browser console test script for Stage-A canonical prompts
 * Copy and paste this into the browser console to test routing
 */

// Test canonical prompts
const testPrompts = [
  'Z001 June snapshot',
  'Top counterparties YTD', 
  'Monthly gross trend',
  'Random query that should not match'
];

// Import from global scope
const { routeMessage } = window.require('./data/router/router');
const { routeToTemplate } = window.require('./data/router/topicRouter');

console.log('===== TESTING STAGE-A CANONICAL PROMPTS =====\n');

testPrompts.forEach(prompt => {
  console.log(`Testing prompt: "${prompt}"`);
  const routerResult = routeMessage(prompt);
  console.log('Router result:', routerResult);
  
  const templateResult = routeToTemplate(routerResult, prompt);
  console.log('Template result:', templateResult);
  console.log('-----------------------------------\n');
});

// Test API call for Z001 June snapshot
async function testCanonicalPromptAPI() {
  const message = 'Z001 June snapshot';
  const routerResult = routeMessage(message);
  const templateResult = routeToTemplate(routerResult, message);
  
  console.log('Making test API call for:', message);
  console.log('With payload:', {
    message,
    router: { domain: templateResult.domain },
    template: { id: templateResult.template_id },
    params: templateResult.params
  });
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        router: { domain: templateResult.domain },
        template: { id: templateResult.template_id },
        params: templateResult.params
      })
    });
    
    const result = await response.json();
    console.log('API Response:', result);
    console.log('Answer has correct shape:', 
      result.text !== undefined && 
      result.mode === 'strict' && 
      result.provenance?.source === 'mock'
    );
  } catch (error) {
    console.error('API call failed:', error);
  }
}

// Run the API test
testCanonicalPromptAPI().catch(console.error);
