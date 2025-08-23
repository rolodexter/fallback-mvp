# Deployment Instructions for Generic LLM Response Fix

## Overview

These instructions guide you through deploying the fixes for the generic LLM response issue. The fixes address:

1. Deprecated method usage causing grounding bypass
2. Fragile platform detection logic
3. Missing environment variable validation
4. Insufficient error handling and logging

## Pre-Deployment Checklist

- [ ] Review all code changes in this PR
- [ ] Verify environment variables are properly configured in both Vercel and Netlify
- [ ] Ensure you have access to deployment platforms (Vercel/Netlify)
- [ ] Back up the production environment configuration

## Required Environment Variables

Ensure these environment variables are set in **both** Vercel and Netlify:

| Variable | Description | Required |
|----------|-------------|----------|
| `PROVIDER` | LLM provider name (should be "perplexity") | Yes |
| `PERPLEXITY_API_KEY` | API key for Perplexity | Yes |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google credentials file | Yes |
| `VITE_DEPLOY_PLATFORM` | Platform identifier ("vercel" or "netlify") | Yes |

## Deployment Steps

### 1. Stage Deployment

1. Deploy the changes to a staging environment first
   ```
   # For Vercel
   vercel
   
   # For Netlify
   netlify deploy
   ```

2. Run smoke tests in the staging environment:
   - Open the staging application in your browser
   - Open browser console (F12)
   - Run the smoke test script:
   ```javascript
   // Load the test script (already in the codebase)
   fetch('/tests/smoke_test.js').then(r => r.text()).then(eval);
   
   // Run all tests
   runAllTests();
   
   // Test chat functionality
   testChatMessage("How is our revenue trending?").then(r => console.log(r))
   ```

### 2. Production Deployment

Once staging verification is complete:

1. Deploy to production
   ```
   # For Vercel
   vercel --prod
   
   # For Netlify
   netlify deploy --prod
   ```

2. Verify the deployment by:
   - Checking application logs for any errors
   - Running smoke tests in production (same as staging)
   - Testing with various financial queries to ensure grounded responses

### 3. Rollback Procedure (If Needed)

If issues are encountered after deployment:

#### Vercel Rollback
1. Navigate to the Vercel dashboard
2. Select the project
3. Go to "Deployments" tab
4. Find the previous working deployment
5. Click "..." and select "Redeploy"

#### Netlify Rollback
1. Navigate to the Netlify dashboard
2. Select the site
3. Go to "Deploys" tab
4. Find the last working deploy
5. Click the deploy and select "Publish deploy"

## Post-Deployment Verification

1. Monitor application logs for at least 1 hour after deployment
2. Check for any error responses or timeouts
3. Verify grounding is working by asking financial questions
4. Confirm environment variables are correctly detected

## Troubleshooting Common Issues

### Generic Responses Still Appearing
- Check environment variables (particularly `PROVIDER` and API keys)
- Verify platform detection in browser console: `window.__riskillDebug`
- Ensure BigQuery credentials are valid

### API Errors
- Check API rate limits
- Verify API keys are valid and not expired
- Check server logs for detailed error messages

### Platform Detection Issues
- Set `VITE_DEPLOY_PLATFORM` explicitly to the correct value
- Check browser console for platform detection logs
- Verify health endpoints are accessible
