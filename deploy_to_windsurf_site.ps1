# Hardened Netlify deployment script for existing Windsurf site
# Uses token-based authentication and CI mode to avoid stalls

# 0) Go to repo root
cd C:\dev\fallback-mvp

# 1) Harden Netlify CLI (avoid update stalls/errors)
$env:NETLIFY_AUTH_TOKEN="PASTE_YOUR_TOKEN"
$env:NETLIFY_SITE_ID="YOUR_WINDSURF_SITE_ID"   # from Site Settings > General > Site information
$env:NETLIFY_CLI_DISABLE_UPDATE_CHECK="1"
$env:CI="true"

# 2) Ensure we're linked to the existing Windsurf project
netlify link --id $env:NETLIFY_SITE_ID

# 3) Stage A env (mock only)
netlify env:set DATA_MODE mock
netlify env:set PROVIDER perplexity
netlify env:set PERPLEXITY_API_KEY your_api_key_here
netlify env:set POLISH_NARRATIVE false

# 4) Clean build
npm ci
npm run build

# 5) Deploy to the already-claimed Windsurf site
netlify deploy --dir=dist --functions=netlify/functions --prod --message "Stage A mock redeploy"
