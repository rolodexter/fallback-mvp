# Deployment Hot-Fix for BigQuery Credentials

This document provides instructions for fixing the credential handling issues that were causing 502 errors in the production deployment.

## Environment Variable Changes

Update your environment variables as follows:

### For Base64-encoded Credentials

If your service account key is base64 encoded (starts with `ewogIC`):

```
GOOGLE_APPLICATION_CREDENTIALS_B64=<base64-encoded-key>
```

**Important:** Remove or unset `GOOGLE_APPLICATION_CREDENTIALS_JSON` if it exists.

### For JSON Credentials

If your service account key is in raw JSON format (one line):

```
GOOGLE_APPLICATION_CREDENTIALS_JSON=<raw-json-key>
```

### For File Path Credentials

If your service account key is in a file:

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials.json
```

## Additional Required Configuration

Ensure these environment variables are also set:

```
DATA_MODE=bq
ALLOW_MOCK_FALLBACK=0  # Set to 1 if you want to allow mock data fallback
GOOGLE_PROJECT_ID=<your-project-id>
BQ_DEFAULT_DATASET=<default-dataset>
BQ_DEFAULT_TABLE=<default-table>
BQ_LOCATION=US  # Or your preferred location
```

## Verification After Deployment

1. First check the BQ health endpoint to confirm credentials are working:

```bash
curl -s "https://your-deploy-url/.netlify/functions/bq-health" | jq
```

Expected output:
```json
{
  "ok": true,
  "cred_mode": "b64",  # or "json" or "path"
  "build": "commit-hash"
}
```

2. Then test the chat endpoint:

```bash
curl -s "https://your-deploy-url/.netlify/functions/chat" \
  -H 'content-type: application/json' \
  -d '{"message":"most important business unit"}' | \
  jq '.provenance.source,.provenance.tag,.mode'
```

Expected output:
```
"bq"
"TEMPLATE_RUN"  # (or "BQ_ERROR" if there's a data issue)
"text"          # (or "no_data" if no results)
```

## Troubleshooting

- If `bq-health` returns `{"ok":false}`, check your credentials and environment variables
- If you see `BQ_ERROR` in chat response provenance, check the specific error_code for details
- If you still see 502 errors, confirm the deployment has the updated code with the 200-always error handling

## Code Changes Summary

1. Added robust credential handling in `src/lib/bq.ts` with support for:
   - JSON credentials via `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   - Base64 encoded credentials via `GOOGLE_APPLICATION_CREDENTIALS_B64`
   - File path credentials via `GOOGLE_APPLICATION_CREDENTIALS`

2. Updated Netlify functions to use ESM imports with `.js` extensions:
   ```typescript
   import { makeBQ, runBQOrReport } from "../../src/lib/bq.js";
   ```

3. Added 200-always error handling wrapper around chat handler to prevent 502 errors
4. Added detailed provenance information for better debugging
5. Created `bq-health.ts` endpoint to verify BigQuery connectivity
