/**
 * Test script to verify router returns proper object for canonical prompts
 * Copy and paste into browser console
 */

// Test Z001 June snapshot routing
const { routeMessage } = window.require('./data/router/router');
const { routeToTemplate } = window.require('./data/router/topicRouter');

const message = 'Z001 June snapshot';
console.log('Testing routing for:', message);

// Step 1: Check direct router result
const routerResult = routeMessage(message);
console.log('Router result:', routerResult);

// Step 2: Check template routing
const templateResult = routeToTemplate(routerResult, message);
console.log('Template result:', templateResult);

// Verification check
console.log('✅ Router returned object:', !!routerResult);
console.log('✅ Router domain:', routerResult.domain);
console.log('✅ Template ID:', templateResult.template_id);
