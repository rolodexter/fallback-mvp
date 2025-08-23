# Smoke Test Plan

This document outlines the comprehensive smoke test plan to verify that the fixes for the generic LLM responses issue have been successfully implemented.

## Test Environment Setup

1. Deploy the patched application to a staging environment with the following configurations:
   - Vercel deployment
   - Netlify deployment
   - All required environment variables properly configured

2. Prepare test tools:
   - Browser with Developer Tools
   - Network monitoring
   - API testing tool (e.g., Postman, curl)

## Test Cases

### 1. Platform Detection Tests

| Test ID | Description | Expected Result | Actual Result |
|---------|-------------|----------------|---------------|
| PD-01 | Navigate to app with VITE_DEPLOY_PLATFORM=vercel | Endpoint set to '/api/chat' | |
| PD-02 | Navigate to app with VITE_DEPLOY_PLATFORM=netlify | Endpoint set to '/.netlify/functions/chat' | |
| PD-03 | Navigate to app with VITE_DEPLOY_PLATFORM unset | Fallback detection successfully identifies platform | |
| PD-04 | Check window.__riskillDebug in console | Shows correct platform and endpoint | |

### 2. Basic Chat Functionality

| Test ID | Description | Expected Result | Actual Result |
|---------|-------------|----------------|---------------|
| CF-01 | Send generic message "Hello" | Response mentions being a financial assistant, not generic greeting | |
| CF-02 | Send domain-specific message "How is business unit performance?" | Response includes financial context and mentions business units | |
| CF-03 | Verify network requests in Developer Tools | Correct endpoint called with proper payload including grounding | |
| CF-04 | Check error handling with network disabled | Graceful error displayed to user | |

### 3. Domain Routing Tests

| Test ID | Description | Expected Result | Actual Result |
|---------|-------------|----------------|---------------|
| DR-01 | Send performance query "Show me performance metrics" | Router assigns 'performance' domain with high confidence | |
| DR-02 | Send counterparties query "Who are our top customers?" | Router assigns 'counterparties' domain with high confidence | |
| DR-03 | Send risk query "What's our risk exposure?" | Router assigns 'risk' domain with high confidence | |
| DR-04 | Send ambiguous query "Tell me more about the trends" | Router assigns appropriate domain or 'none' with explanation | |

### 4. Grounding Pipeline Tests

| Test ID | Description | Expected Result | Actual Result |
|---------|-------------|----------------|---------------|
| GP-01 | Send performance query and check network payload | Request includes appropriate grounding data | |
| GP-02 | Examine response to performance query | Response references business unit data from grounding | |
| GP-03 | Check debug info for grounding details | Debug info shows domain, confidence, and grounding type | |
| GP-04 | Test query that should return 'no_data' grounding | Response acknowledges lack of data but stays on topic | |

### 5. Environment Variable Tests

| Test ID | Description | Expected Result | Actual Result |
|---------|-------------|----------------|---------------|
| EV-01 | Test with missing PERPLEXITY_API_KEY (simulated) | Clear error response indicating missing credentials | |
| EV-02 | Test with invalid PROVIDER value (simulated) | Error response indicating invalid provider configuration | |
| EV-03 | Test with all variables correctly configured | Successful responses with grounded data | |

### 6. Error Handling Tests

| Test ID | Description | Expected Result | Actual Result |
|---------|-------------|----------------|---------------|
| EH-01 | Simulate BigQuery API failure | Graceful fallback with explanation | |
| EH-02 | Simulate Perplexity API timeout | Error message with retry suggestion | |
| EH-03 | Send malformed request | Proper error handling without exposing system details | |
| EH-04 | Test with large conversation history | Handles correctly without performance issues | |

## Test Execution Log

| Date | Tester | Test IDs | Result | Notes |
|------|--------|----------|--------|-------|
| 2025-10-25 | | | | |

## Success Criteria

1. No generic LLM responses observed in any test case
2. All domain-specific queries receive appropriately grounded responses
3. Platform detection works correctly in all scenarios
4. Error cases are handled gracefully with informative messages
5. Debug information confirms correct operation of router and grounding pipeline

## Post-Deployment Monitoring

After successful testing and deployment to production:

1. Monitor application logs for:
   - Platform detection failures
   - API call errors
   - Generic response detection alerts

2. Set up alerts for:
   - Unhandled exceptions in chat functionality
   - High rate of "generic response detected" warnings
   - Environment variable configuration issues

3. Perform periodic spot checks:
   - Weekly test of common financial queries
   - Verification of grounding pipeline functionality
   - Review of any user-reported issues
