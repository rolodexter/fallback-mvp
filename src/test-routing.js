/**
 * Test script to verify Stage-A canonical prompt routing
 */

// Import the router functions
const { routeMessage } = require('./data/router/router');
const { routeToTemplate } = require('./data/router/topicRouter');

// Test canonical prompts
const testPrompts = [
  'Z001 June snapshot',
  'Top counterparties YTD',
  'Monthly gross trend',
  'Random query that should not match'
];

console.log('===== TESTING STAGE-A CANONICAL PROMPTS =====\n');

testPrompts.forEach(prompt => {
  console.log(`Testing prompt: "${prompt}"`);
  const routerResult = routeMessage(prompt);
  console.log('Router result:', routerResult);
  
  const templateResult = routeToTemplate(routerResult, prompt);
  console.log('Template result:', templateResult);
  console.log('-----------------------------------\n');
});
