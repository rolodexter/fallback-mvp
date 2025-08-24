# Stage A Mock Templates Implementation

## Overview
This document summarizes the implementation of two new deterministic mock templates for the Stage A environment, as requested:
- `regional_performance_v1`
- `profitability_summary_v1`

## Implementation Details

### 1. Mock Data
Created two JSON files in `public/mock-data/`:
- `regional_performance.json`: Contains region-specific revenue data with YoY comparisons
- `profitability_summary.json`: Contains business unit profitability metrics

### 2. Template Modules
Implemented two deterministic template modules in `src/templates/`:
- `regional_performance_v1.ts`: Reads mock JSON data and computes KPIs for regional performance
- `profitability_summary_v1.ts`: Reads mock JSON data and computes profitability metrics

Both templates:
- Load data from the filesystem
- Calculate key performance indicators (KPIs) like YoY growth and margin percentages
- Return structured responses with text, KPIs, and provenance metadata
- Operate deterministically with no LLM calls

### 3. Template Registry Integration
Updated `src/data/templates/template_registry.json` to include the new templates:
```json
"profitability": {
  "schemaId": "profit_v1",
  "summaryFn": "profitabilitySummary",
  "groundingNarrativeId": "profitability_intro",
  "templateId": "profitability_summary_v1"
},
"regional": {
  "schemaId": "region_v1",
  "summaryFn": "regionalSummary",
  "groundingNarrativeId": "regional_intro",
  "templateId": "regional_performance_v1"
}
```

### 4. Router Expansion
Created `src/data/router/topicRouter.ts` to handle routing to the new templates:
- Added routing for "regional" and "regions" keywords to the regional performance template
- Added routing for "profit", "margin", and "profitability" keywords to the profitability template

### 5. Smoke Tests
Extended smoke tests in `tests/smoke_test.js` to include new test cases:
- S5: Tests regional performance template with "Show me regional performance"
- S6: Tests profitability summary template with "What is our profitability?"

Added a new `testTemplateResponse()` function to specifically verify template-based responses.

## Testing
After deployment, test the application with:
1. "Regional performance 24 months" - Should show regional KPIs
2. "Profitability summary" - Should show profitability metrics
3. Existing functionality: "Z001 June snapshot", "Top counterparties YTD", "July results"

## Deployment
Changes have been pushed to the main branch and should automatically deploy to Vercel.
