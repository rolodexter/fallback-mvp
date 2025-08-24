# Stage-A Chat Contract Deployment Recommendations

**Date**: 2025-08-24
**Version**: 1.0
**Author**: Windsurf AI

## 1. Deployment Configurations

### 1.1 Environment Variables

The following environment variables should be set for production deployment:

| Variable | Value | Purpose |
|----------|-------|---------|
| VITE_DEPLOY_PLATFORM | 'netlify' or 'vercel' | Determines the API endpoint path |
| NODE_ENV | 'production' | Disables development features like MSW |

### 1.2 Build Configuration

Ensure the build process properly:
- Sets production environment variables
- Disables Mock Service Worker in production builds
- Optimizes assets for production

## 2. Platform-Specific Settings

### 2.1 Netlify Deployment

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[dev]
  command = "npm run dev"
  port = 3000
  
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 2.2 Vercel Deployment

```json
// vercel.json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

## 3. Verification Checklist

After deploying to production, verify:

- [x] API endpoints are correctly configured (/api/chat for Vercel, /.netlify/functions/chat for Netlify)
- [x] MSW is disabled in production
- [x] Environment variables are correctly set
- [x] Canonical prompts route to the correct domain and template
- [x] API responses follow the strict Answer format
- [x] UI properly renders the Answer.text without fallback intro messages

## 4. Rollback Strategy

In case of deployment issues:

1. Verify logs for API endpoint errors
2. Check network requests for correct payload format
3. Ensure platform detection is working correctly
4. If needed, roll back to previous version using platform deployment history

## 5. Post-Deployment Monitoring

Monitor the following after deployment:

1. API response times for chat requests
2. Error rates and types
3. User engagement with canonical prompts
4. Routing accuracy for canonical prompts

## 6. Future Enhancements

Consider these improvements for future stages:

1. Add server-side logging for chat routing decisions
2. Implement analytics to track canonical prompt usage
3. Create a dashboard for monitoring system performance
4. Add more robust error handling for API failures
5. Extend template registry with additional domains and templates
