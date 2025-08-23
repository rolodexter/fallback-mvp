# Mock Data Mode Implementation Notes

## Overview
This document summarizes the changes made to implement the mock data mode for the chat system. The implementation ensures deterministic, high-quality responses from the router → templates → narratives pipeline without depending on BigQuery, facilitating stable demos and proving out the "good responses first" approach.

## Key Changes

### Environment Variables
- Added support for `DATA_MODE=mock` to bypass BigQuery calls
- Made `GOOGLE_APPLICATION_CREDENTIALS` only required when `DATA_MODE=live`
- Added support for `POLISH_NARRATIVE=true|false` to optionally improve narrative quality

### Netlify Serverless Function
- Completed mock mode implementation to mirror Vercel's functionality
- Fixed environment variable requirements to support mock mode
- Added template-to-response wiring with mock JSON data
- Implemented widget extraction from KPI data
- Added narrative polishing feature using LLM when `POLISH_NARRATIVE=true`
- Updated response structure to include proper provenance and metadata

### Response Structure
The system now returns responses in the following format:
```json
{
  "text": "Response narrative from template or polished by LLM",
  "mode": "strict",
  "widgets": "Optional widget data extracted from KPI summary",
  "meta": {
    "domain": "Matched domain",
    "confidence": "Router confidence score",
    "groundingType": "Template/drilldown type"
  },
  "provenance": {
    "template_id": "Template ID used",
    "source": "mock or live"
  }
}
```

### Error Handling
- Added proper abstention logic when template or data is not available
- Improved error reporting with meaningful messages
- Added fallbacks to template data when polishing fails

## Next Steps
- Run comprehensive smoke tests to validate all functionality
- Verify that both Vercel and Netlify functions behave identically in mock mode
- Document test results and prepare for deployment
