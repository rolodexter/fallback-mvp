# Deployment Verification

This document provides guidance for verifying the successful deployment of fixes for the generic LLM responses issue in the Fallback MVP Dashboard.

## Pre-Deployment Checklist

Before deploying fixes to production, verify:

- [ ] All code changes have been reviewed
- [ ] Unit tests pass
- [ ] Smoke tests have been executed in a staging environment
- [ ] Environment variables are properly configured
- [ ] Deployment platform is correctly specified (VITE_DEPLOY_PLATFORM)

## Deployment Process

1. **Staging Deployment**
   - Deploy to staging environment first
   - Run smoke tests (see `05_smoke_test_plan.md`)
   - Verify functionality across all test cases
   - Check logs for any warnings or errors

2. **Production Deployment**
   - Schedule deployment during low-traffic period
   - Create backup of current production environment
   - Deploy patched version to production
   - Verify environment variables are correctly set

3. **Verification Steps**

   | Step | Action | Success Criteria |
   |------|--------|-----------------|
   | 1 | Navigate to application URL | App loads successfully |
   | 2 | Open browser console | No errors or warnings |
   | 3 | Check window.__riskillDebug | Platform and endpoint correctly identified |
   | 4 | Send test message "Hello" | Response mentions being a financial assistant |
   | 5 | Send domain query "Show performance metrics" | Response includes grounded financial data |
   | 6 | Check network requests | Proper endpoint called with grounding data |
   | 7 | Verify serverless function logs | No errors, successful API calls |

## Post-Deployment Monitoring

Monitor the following metrics for 48 hours after deployment:

1. **Error Rates**
   - API call failures
   - Client-side exceptions
   - Serverless function errors

2. **Response Quality**
   - Check for any generic response detections
   - Monitor average response length
   - Verify domain detection accuracy

3. **Performance Metrics**
   - API response times
   - Frontend rendering performance
   - Overall application load time

## Rollback Plan

If issues are detected after deployment:

1. **Triggers for Rollback**
   - Multiple users reporting generic responses
   - Error rate increases by more than 10%
   - Critical functionality broken

2. **Rollback Process**
   - Restore from backup
   - Verify rollback was successful
   - Notify stakeholders
   - Schedule new deployment after fixes

3. **Communication Plan**
   - Notify internal team immediately
   - Update status page if external users are affected
   - Prepare messaging for support team

## Sign-off

| Role | Name | Signature | Date |
|------|------|----------|------|
| Engineering Lead | | | |
| QA Tester | | | |
| Product Manager | | | |

## Final Verification

Once the deployment is complete and verified, update this document with:

- Deployment timestamp
- Verification results
- Any issues encountered and their resolution
- Link to monitoring dashboard
