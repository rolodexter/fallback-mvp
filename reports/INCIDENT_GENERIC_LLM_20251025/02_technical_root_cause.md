# Technical Root Cause Analysis

## Overview

This document provides a detailed technical analysis of why the Fallback MVP Dashboard application was returning generic LLM trivia responses instead of grounded financial insights.

## Primary Technical Issue

The chat component in `src/components/chat/ChatPanel.tsx` was using the deprecated `sendMessage()` method instead of the current `sendChat()` method:

```typescript
// In ChatPanel.tsx
// ISSUE: Using deprecated method that bypasses proper grounding
const response = await chatClient.sendMessage(message, newDomain);
```

This deprecated method implementation in `chatClient.ts` directly calls `sendChat()` but does not properly pass the chat history:

```typescript
// In chatClient.ts
async sendMessage(message: string, _domain?: string): Promise<ChatResponse> {
  console.warn('sendMessage is deprecated, use sendChat instead');
  // ISSUE: Empty array passed as history, losing context
  return this.sendChat(message, []);
}
```

## Endpoint Detection Issues

The platform detection mechanism in `chatClient.ts` attempts to detect whether the application is running on Vercel or Netlify by probing health endpoints:

```typescript
// Try Vercel endpoint
try {
  const vercelResponse = await fetch('/api/health');
  if (vercelResponse.ok) {
    const data = await vercelResponse.json();
    if (data.ok) {
      this.endpoint = '/api/chat';
      // Set endpoint and platform
    }
  }
} catch (error) {
  console.warn('Could not connect to Vercel endpoint:', error);
}
```

However, this detection can fail in the following scenarios:
1. Network connectivity issues
2. CORS restrictions in production
3. Misconfigured serverless functions
4. Timeouts or service availability issues

When detection fails, it defaults to `/api/chat`:

```typescript
// Default fallback if both fail
this.endpoint = '/api/chat';
if (typeof window !== 'undefined') {
  window.__riskillDebug.endpoint = this.endpoint;
  window.__riskillDebug.platform = 'unknown';
}
```

## Environment Variable Configuration

The application depends on several environment variables:

1. `PROVIDER`: Set to 'perplexity' for using Perplexity AI
2. `PERPLEXITY_API_KEY`: Required for authentication with Perplexity AI
3. `GOOGLE_APPLICATION_CREDENTIALS`: Required for BigQuery access
4. `VITE_DEPLOY_PLATFORM`: Specifies the deployment platform ('vercel' or 'netlify')

If these variables are missing or misconfigured in the Windsurf build environment, the application may:
1. Fail to authenticate with Perplexity AI
2. Default to generic responses without proper system prompts
3. Skip grounding due to inability to access BigQuery data
4. Use incorrect API endpoints

## Grounding Flow Issues

The intended flow for grounded responses is:
1. Route message to appropriate domain
2. Query BigQuery for relevant data
3. Use templates to format data
4. Send grounded request to LLM

This flow is implemented in the `sendChat()` method but bypassed in the deprecated `sendMessage()` method. Additionally, there's insufficient validation to ensure grounding data is present before sending requests to the LLM.

## Error Handling Deficiencies

The application lacks robust error handling in several key areas:

1. No graceful degradation when BigQuery is unavailable
2. Limited validation of LLM responses to ensure they're properly grounded
3. Silent failures that default to generic LLM responses
4. No clear error messages to users or logs when the grounding pipeline fails

## MSW Configuration

The Mock Service Worker (MSW) is correctly configured to only run in development mode:

```typescript
// In main.ts or similar entry point
if (import.meta.env.MODE === 'development') {
  const { worker } = await import('./mocks/browser');
  worker.start();
}
```

MSW was not a contributing factor to this incident as it should be disabled in production builds.

## Summary of Technical Findings

The root issue was the use of a deprecated method that bypassed the proper grounding pipeline, combined with potential endpoint detection failures and environment variable misconfiguration. These issues together resulted in generic, ungrounded LLM responses being returned to users.

The next section will detail the specific patches required to resolve these issues.
