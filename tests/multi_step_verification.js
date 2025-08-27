// Multi-step Prompting Implementation Verification
// This script performs a static analysis of the codebase to ensure the multi-step 
// prompting implementation meets all requirements

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========== MULTI-STEP PROMPTING VERIFICATION ==========');

// Paths to files that should be analyzed
const PATHS = {
  llmProvider: path.resolve(__dirname, '../src/services/llmProvider.ts'),
  chatFunction: path.resolve(__dirname, '../netlify/functions/chat.ts'),
  envExample: path.resolve(__dirname, '../.env.example')
};

// Feature requirements to verify
const REQUIREMENTS = [
  {
    id: 'multistep_function',
    description: 'Multi-step response generation function exists',
    test: (content) => content.includes('generateMultiStepResponse'),
    file: 'chatFunction'
  },
  {
    id: 'placeholder_extraction',
    description: 'Placeholder extraction functionality exists',
    test: (content) => content.includes('extractPlaceholders'),
    file: 'chatFunction'
  },
  {
    id: 'skeleton_stage',
    description: 'Skeleton generation stage implemented',
    test: (content) => content.includes("'skeleton'") || content.includes('"skeleton"'),
    file: 'llmProvider'
  },
  {
    id: 'reasoning_stage',
    description: 'Reasoning stage implemented',
    test: (content) => content.includes("'reasoning'") || content.includes('"reasoning"'),
    file: 'llmProvider'
  },
  {
    id: 'polish_stage',
    description: 'Polish stage implemented',
    test: (content) => content.includes("'polish'") || content.includes('"polish"'),
    file: 'llmProvider'
  },
  {
    id: 'error_handling',
    description: 'Error handling for multi-step prompting',
    test: (content) => content.includes('Falling back to single-step response'),
    file: 'chatFunction'
  },
  {
    id: 'detailed_logging',
    description: 'Detailed logging implemented',
    test: (content) => content.includes('multiStepId') && content.includes('Step 1:') && 
                      content.includes('Step 2:') && content.includes('Step 3:'),
    file: 'chatFunction'
  },
  {
    id: 'env_multistep',
    description: 'ENABLE_MULTI_STEP environment variable defined',
    test: (content) => content.includes('ENABLE_MULTI_STEP='),
    file: 'envExample'
  },
  {
    id: 'perplexity_integration',
    description: 'Perplexity LLM integration with proper parameters',
    test: (content) => content.includes('callPerplexity') && content.includes('disable_search:'),
    file: 'llmProvider'
  },
  {
    id: 'different_temps',
    description: 'Different temperatures for different stages',
    test: (content) => {
      // Check if we have different temperature settings for different stages
      const skeleton = content.includes('skeleton') && content.match(/temperature:\s*0\.[0-9]+/g);
      const polish = content.includes('polish') && content.match(/temperature:\s*0\.[0-9]+/g);
      return skeleton && polish && content.match(/temperature:/g).length >= 2;
    },
    file: 'llmProvider'
  }
];

// Read file contents
const fileContents = {};
Object.entries(PATHS).forEach(([key, filePath]) => {
  try {
    fileContents[key] = fs.readFileSync(filePath, 'utf8');
    console.log(`✅ Loaded ${key} from ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to load ${key} from ${filePath}:`, error.message);
    fileContents[key] = '';
  }
});

// Verify requirements
const results = REQUIREMENTS.map(req => {
  const content = fileContents[req.file];
  const passed = req.test(content);
  
  return {
    ...req,
    passed
  };
});

// Display results
console.log('\n========== VERIFICATION RESULTS ==========');

const passedCount = results.filter(r => r.passed).length;
const totalCount = results.length;
const passRate = Math.round((passedCount / totalCount) * 100);

results.forEach(result => {
  const symbol = result.passed ? '✅' : '❌';
  console.log(`${symbol} ${result.description}`);
});

console.log('\n========== SUMMARY ==========');
console.log(`Passed: ${passedCount}/${totalCount} (${passRate}%)`);

if (passedCount === totalCount) {
  console.log('✨ All multi-step prompting requirements are satisfied!');
} else {
  console.log('⚠️ Some multi-step prompting requirements are not satisfied.');
  
  const failed = results.filter(r => !r.passed);
  console.log('\nFailed requirements:');
  failed.forEach(item => {
    console.log(`❌ ${item.description} [${item.id}]`);
  });
}

// Recommendations
console.log('\n========== RECOMMENDATIONS ==========');

if (passedCount < totalCount) {
  console.log('1. Address the failed requirements above');
}

console.log('2. Test the implementation with real business unit queries');
console.log('3. Monitor logs to verify all stages are working as expected');
console.log('4. Verify that fallbacks work when a stage fails');
console.log('5. Check performance and response quality between single and multi-step approaches');

console.log('\nVerification completed.');
