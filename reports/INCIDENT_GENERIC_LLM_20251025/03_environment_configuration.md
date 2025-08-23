# Environment Configuration Issues

## Overview

This document details the environment configuration issues that contributed to the generic LLM responses incident in the Fallback MVP Dashboard application.

## Critical Environment Variables

The application relies on the following environment variables:

| Variable | Purpose | Impact if Missing |
|----------|---------|------------------|
| `PROVIDER` | Specifies the LLM provider to use (e.g., 'perplexity') | Falls back to default provider which may not support grounding |
| `PERPLEXITY_API_KEY` | Authentication key for Perplexity API | API calls fail or return errors |
| `GOOGLE_APPLICATION_CREDENTIALS` | BigQuery authentication credentials | Unable to fetch financial data for grounding |
| `VITE_DEPLOY_PLATFORM` | Specifies deployment platform ('vercel' or 'netlify') | Endpoint detection may fail or use incorrect endpoints |
| `REDIS_URL` and `REDIS_TOKEN` | Redis cache configuration (if enabled) | Cache misses, degraded performance |

## Deployment Configuration

The application is deployed to Windsurf's build environment at `https://fallback-mvp-dashboard.windsurf.build/`. Analysis of the deployment configuration shows:

### Environment Variable Detection

The client-side code attempts to detect the deployment platform in multiple ways:

1. First by checking `import.meta.env.VITE_DEPLOY_PLATFORM`
2. Then by probing API health endpoints
3. Finally falling back to a default value

This cascade can lead to incorrect platform detection if environment variables are not properly set.

### BigQuery Client Configuration

The BigQuery client also depends on proper platform detection:

```typescript
function getBaseUrl(): string {
  // If window is defined, we're in the browser
  if (typeof window !== 'undefined') {
    // Check for platform-specific environment variable
    const platform = import.meta.env.VITE_DEPLOY_PLATFORM;
    
    // Use window location as base
    const origin = window.location.origin;
    
    // If explicitly set to netlify
    if (platform === 'netlify') {
      return `${origin}/.netlify/functions`;
    }
    
    // Otherwise default to Vercel-style API routes
    return `${origin}/api`;
  }
  
  // Fallback for SSR (though this client is primarily for browser use)
  return '/api';
}
```

If `VITE_DEPLOY_PLATFORM` is not set correctly, BigQuery API calls may be directed to the wrong endpoint.

## Serverless Function Environment

The serverless functions require:

1. `PERPLEXITY_API_KEY` for authentication
2. `PROVIDER` to determine which LLM provider to use
3. `GOOGLE_APPLICATION_CREDENTIALS` for BigQuery access

In the serverless functions, there are insufficient checks for these environment variables:

```typescript
// In chat.ts serverless function
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers omitted for brevity
  
  // Missing robust checks for environment variables
  
  try {
    const { message, grounding } = req.body;
    const llmResponse = await callLLMProvider(message, grounding);
    // Response handling
  } catch (error) {
    // Error handling
  }
}
```

## Build Process Configuration

The build process may not correctly inject environment variables in production builds:

1. Vite only exposes variables prefixed with `VITE_` to client-side code
2. Serverless functions need variables present in the deployment environment

## Recommended Configuration Changes

1. Add explicit environment variable validation in all serverless functions
2. Add clear error responses when required variables are missing
3. Create a unified environment check at application startup
4. Implement more robust platform detection that prioritizes `VITE_DEPLOY_PLATFORM`
5. Add logging for environment configuration status

## Environment Variables Security Audit

All environment variables are properly secured:
- No hardcoded API keys in the codebase
- Proper use of environment variables for sensitive credentials
- No exposure of sensitive variables to client-side code

## Deployment Best Practices

For future deployments:
1. Validate all required environment variables before deployment
2. Implement a pre-flight check that verifies endpoint connectivity
3. Add monitoring for environment variable usage
4. Create deployment checklists that include environment variable verification
