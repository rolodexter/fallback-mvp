# Run smoke tests against deployed Netlify endpoint
# Replace the URL with your actual deployed Netlify site URL

# Set the environment variable to point to your deployed endpoint
$env:CHAT_NETLIFY_URL="https://YOUR-SITE.netlify.app/.netlify/functions/chat"

# Run the smoke tests
Write-Host "Running smoke tests against $env:CHAT_NETLIFY_URL"
node reports\STAGE_A_MOCK_20250823\smoke_test.js

# Results will be written to reports\STAGE_A_MOCK_20250823\05_SMOKE_RESULTS.md
Write-Host "`nSmoke test results have been written to:"
Write-Host "reports\STAGE_A_MOCK_20250823\05_SMOKE_RESULTS.md"
