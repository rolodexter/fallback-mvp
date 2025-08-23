# Stage A Acceptance Criteria

## Deployment Verification Checklist

To verify that the Stage A mock data mode implementation is functioning correctly after deployment, confirm the following:

1. **Environment Configuration**
   - `DATA_MODE=mock` is honored; no BigQuery I/O
   - `POLISH_NARRATIVE` setting correctly applied

2. **Response Modes**
   - **Query: "hello"**
     - Expected: `mode: 'nodata'` with `reason: 'no_domain'`
     - This verifies client short-circuit for unmatched messages
   
   - **Query: "Z001 June snapshot"**
     - Expected: `mode: 'strict'` 
     - Provenance includes `template_id: 'performance'` and `source: 'mock'`
     - KPIs/widgets present in response
   
   - **Query: "Top counterparties YTD"**
     - Expected: `mode: 'strict'`
     - Provenance includes `template_id: 'counterparties'` and `source: 'mock'`
     - KPIs/widgets present in response
   
   - **Query: "July results"**
     - Expected: `mode: 'abstain'` with appropriate `abstain_reason`
     - This verifies proper handling of out-of-coverage queries

3. **Platform Parity**
   - Netlify function should produce identical responses to Vercel
   - Response structure matches across platforms

## Smoke Test Results

The smoke test results will be documented in:
```
reports\STAGE_A_MOCK_20250823\05_SMOKE_RESULTS.md
```

This file will contain pass/fail verdicts for each test case. All tests should show ✅ for successful completion of Stage A.
