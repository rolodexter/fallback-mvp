# Non-interactive Netlify deployment script for Stage A (mock data mode)
# Run from project root directory (C:\dev\fallback-mvp)

# 1. Set environment variables for token-based authentication
$env:NETLIFY_AUTH_TOKEN="PASTE_YOUR_TOKEN_HERE"  # Replace with your actual token
$env:NETLIFY_CLI_DISABLE_UPDATE_CHECK="1"

# 2. Install and verify Netlify CLI
Write-Host "Installing Netlify CLI..."
npm i -g netlify-cli
Write-Host "Checking Netlify CLI version..."
netlify --version
Write-Host "Verifying authentication status..."
netlify status --json

# 3. Link to existing Netlify site
# If you know your site ID, uncomment and use this:
# netlify link --id YOUR_SITE_ID

# If you don't know your site ID, this will show an interactive list (safer now with token auth)
Write-Host "Linking to Netlify site..."
netlify link

# 4. Configure Stage A environment variables
Write-Host "Setting environment variables for mock data mode..."
netlify env:set DATA_MODE mock
netlify env:set PROVIDER perplexity
netlify env:set PERPLEXITY_API_KEY your_api_key_here
netlify env:set POLISH_NARRATIVE false

# 5. Build the application
Write-Host "Installing dependencies..."
npm ci
Write-Host "Building application..."
npm run build

# 6. Deploy to Netlify production
Write-Host "Deploying to Netlify..."
netlify deploy --dir=dist --functions=netlify/functions --prod --message "Stage A mock deploy"

# 7. Display deployment URL (you'll need this for smoke tests)
Write-Host "`nDeployment complete! Use this URL for smoke tests:"
Write-Host "CHAT_NETLIFY_URL=https://YOUR-SITE.netlify.app/.netlify/functions/chat"
Write-Host "`nRun smoke tests with:"
Write-Host '$env:CHAT_NETLIFY_URL="https://YOUR-SITE.netlify.app/.netlify/functions/chat"'
Write-Host "node reports\STAGE_A_MOCK_20250823\smoke_test.js"
