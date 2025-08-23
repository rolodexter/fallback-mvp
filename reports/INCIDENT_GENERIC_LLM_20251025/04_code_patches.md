# Code Patches

This document outlines the specific code changes required to fix the generic LLM responses issue in the Fallback MVP Dashboard application.

## 1. Fix ChatPanel.tsx

**File:** `src/components/chat/ChatPanel.tsx`

**Issue:** Using deprecated `sendMessage()` method instead of the proper `sendChat()` method.

**Patch:**

```diff
// Line ~98 in ChatPanel.tsx
- const response = await chatClient.sendMessage(message, newDomain);
+ // Use the modern sendChat method that properly handles grounding
+ const response = await chatClient.sendChat(message, chatHistory);
```

## 2. Improve Platform Detection in chatClient.ts

**File:** `src/services/chatClient.ts`

**Issue:** Platform detection can fail in production environments.

**Patch:**

```diff
// At the start of init() method
async init() {
  if (this.initialized) return;
  
+ // First check for explicitly set platform in environment variables
+ if (typeof import !== 'undefined' && 
+     typeof import.meta !== 'undefined' && 
+     import.meta.env && 
+     import.meta.env.VITE_DEPLOY_PLATFORM) {
+   
+   const platform = import.meta.env.VITE_DEPLOY_PLATFORM;
+   
+   if (platform === 'netlify') {
+     this.endpoint = '/.netlify/functions/chat';
+     if (typeof window !== 'undefined') {
+       window.__riskillDebug.endpoint = this.endpoint;
+       window.__riskillDebug.platform = 'netlify';
+     }
+     console.log('Using Netlify endpoint from env vars:', this.endpoint);
+     this.initialized = true;
+     return;
+   } else if (platform === 'vercel') {
+     this.endpoint = '/api/chat';
+     if (typeof window !== 'undefined') {
+       window.__riskillDebug.endpoint = this.endpoint;
+       window.__riskillDebug.platform = 'vercel';
+     }
+     console.log('Using Vercel endpoint from env vars:', this.endpoint);
+     this.initialized = true;
+     return;
+   }
+ }
+
  // Try Vercel endpoint first
  try {
    // Existing Vercel endpoint detection code
    ...
```

## 3. Add Environment Variable Validation in Serverless Functions

**File:** `api/chat.ts` and `netlify/functions/chat.ts`

**Issue:** Insufficient validation of required environment variables.

**Patch for api/chat.ts:**

```diff
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

+ // Validate required environment variables
+ if (!process.env.PERPLEXITY_API_KEY) {
+   console.error('Missing required environment variable: PERPLEXITY_API_KEY');
+   return res.status(500).json({
+     error: 'Server configuration error: Missing API credentials',
+     diagnostics: 'PERPLEXITY_API_KEY environment variable is not configured',
+     success: false
+   });
+ }
+
+ if (!process.env.PROVIDER || process.env.PROVIDER.toLowerCase() !== 'perplexity') {
+   console.error('Invalid PROVIDER configuration:', process.env.PROVIDER);
+   return res.status(500).json({
+     error: 'Server configuration error: Invalid provider configuration',
+     diagnostics: `Expected PROVIDER=perplexity, got ${process.env.PROVIDER || 'undefined'}`,
+     success: false
+   });
+ }

  // Process the chat request
  try {
    // Existing request processing code
    ...
```

**Apply similar changes to `netlify/functions/chat.ts`**

## 4. Enhance Error Handling in LLM Provider

**File:** `functions/chat.ts` or equivalent LLM provider module

**Issue:** Insufficient validation of grounding data and error handling.

**Patch:**

```diff
export async function callLLMProvider(message: string, grounding: GroundingData | null): Promise<LLMResponse> {
+ // Validate that we have proper grounding when domain confidence is sufficient
+ if (grounding && grounding.domain && grounding.confidence >= 0.3 && 
+     (!grounding.groundingContent || grounding.groundingContent.trim() === '')) {
+   console.warn(`Warning: Empty grounding content for domain ${grounding.domain} with confidence ${grounding.confidence}`);
+   // Add fallback intro content to avoid ungrounded responses
+   grounding.groundingContent = `This is a financial assistant that provides insights about ${grounding.domain}. ` +
+                               `I don't have specific data for this query, but I will provide general guidance about ${grounding.domain}.`;
+   grounding.groundingType = 'no_data';
+ }

  // Prepare system message with grounding if available
  let systemContent = 'You are a helpful financial assistant...';
  
  // Existing LLM provider code
  ...
  
+ // Validate LLM response to ensure it's not a generic response
+ const genericPhrases = [
+   "is a greeting",
+   "commonly used to",
+   "is a term that refers to",
+   "hello there",
+   "in general terms"
+ ];
+
+ if (result && result.reply && grounding && grounding.domain !== 'none') {
+   for (const phrase of genericPhrases) {
+     if (result.reply.toLowerCase().includes(phrase.toLowerCase())) {
+       console.error('Generic response detected despite grounding. Domain:', grounding.domain);
+       result.diagnostics = {
+         warning: 'Generic response detected despite grounding',
+         domain: grounding.domain,
+         groundingType: grounding.groundingType
+       };
+       break;
+     }
+   }
+ }

  return result;
}
```

## 5. Remove Deprecated Methods

**File:** `src/services/chatClient.ts`

**Issue:** Deprecated methods are still available and being used.

**Patch:**

```diff
- /**
-  * Legacy method for backward compatibility
-  * @deprecated Use sendChat instead
-  */
- async sendMessage(message: string, _domain?: string): Promise<ChatResponse> {
-   console.warn('sendMessage is deprecated, use sendChat instead');
-   return this.sendChat(message, []);
- }
```

## 6. Add Comprehensive Logging

**File:** `src/services/chatClient.ts`

**Issue:** Insufficient logging for debugging production issues.

**Patch:**

```diff
async sendChat(userText: string, history: Array<{role: "user" | "assistant", content: string}> = []): Promise<ChatResponse> {
  // Ensure client is initialized
  if (!this.initialized) {
    await this.init();
  }
  
+ console.info('[ChatClient] Sending chat message with grounding pipeline');
  
  try {
    // Build grounded request
    const body = await this.buildGroundedRequest(userText, history);
    
+   console.debug('[ChatClient] Grounded request built:', {
+     domain: body.grounding?.domain || 'none',
+     confidence: body.grounding?.confidence || 0,
+     groundingType: body.grounding?.groundingType || 'none',
+     hasGroundingContent: !!body.grounding?.groundingContent,
+     endpoint: this.endpoint
+   });
    
    // Send the request to the API
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

+   // Log response status
+   console.debug(`[ChatClient] API response status: ${response.status}`);
    
    // Existing response handling code
    ...
  } catch (error) {
+   console.error('[ChatClient] Error in sendChat:', error);
    return {
      text: 'Sorry, there was an error processing your request. Please try again.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

## Implementation Plan

1. Apply these patches in the following order:
   - Fix ChatPanel.tsx first to stop using the deprecated method
   - Improve platform detection in chatClient.ts
   - Enhance serverless function environment validation
   - Add comprehensive logging
   - Remove deprecated methods

2. Test each change individually before moving to the next

3. Deploy changes to a staging environment first for validation

4. Monitor logs after deployment to production to ensure the fixes are working
