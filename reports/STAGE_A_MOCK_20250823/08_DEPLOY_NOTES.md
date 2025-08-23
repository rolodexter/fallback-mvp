# Deployment Notes

This document provides guidance for deploying the mock data mode implementation to both Vercel and Netlify platforms.

## Deployment Prerequisites

1. Ensure all environment variables are set up correctly as described in `06_ENV_SETUP.md`
2. Verify all smoke tests pass before deploying
3. Confirm that both Vercel and Netlify functions have parity in mock mode

## Vercel Deployment

### Configuration

1. Make sure `vercel.json` contains the correct function configuration:

```json
{
  "functions": {
    "api/*.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "env": {
    "DATA_MODE": "mock",
    "PROVIDER": "perplexity"
  }
}
```

2. Environment variables should be set in the Vercel project dashboard:
   - `PERPLEXITY_API_KEY` (required)
   - `POLISH_NARRATIVE` (optional, defaults to false)

### Deployment Commands

```
# Install Vercel CLI if not already installed
npm install -g vercel

# Deploy to Vercel
vercel
```

## Netlify Deployment

### Configuration

1. Ensure `netlify.toml` contains the correct function configuration:

```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[build.environment]
  DATA_MODE = "mock"
  PROVIDER = "perplexity"
```

2. Environment variables should be set in the Netlify project dashboard:
   - `PERPLEXITY_API_KEY` (required)
   - `POLISH_NARRATIVE` (optional, defaults to false)

### Deployment Commands

```
# Install Netlify CLI if not already installed
npm install -g netlify-cli

# Deploy to Netlify
netlify deploy --prod
```

## Post-Deployment Verification

After deploying to either platform:

1. Verify the environment variables are correctly set in the platform's dashboard
2. Run the smoke tests against the deployed endpoints to confirm functionality
3. Test the chat interface with the following queries:
   - "Hello" (should return intro/nodata response)
   - "Z001 June snapshot" (should return business unit performance data)
   - "Top counterparties YTD" (should return counterparty data with widget)
   - "July results" (should abstain with reason)

## Rollback Procedure

If issues are detected post-deployment:

1. For Vercel: `vercel rollback`
2. For Netlify: `netlify rollback`

Alternatively, you can revert to the previous deployment through each platform's dashboard.
