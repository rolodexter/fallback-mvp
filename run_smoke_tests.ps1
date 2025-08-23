# Run smoke tests against the deployed Vercel endpoint

# Set the environment variable to point to your deployed endpoint
# Replace with your actual Vercel site URL
$env:CHAT_ENDPOINT="https://fallback-mvp.vercel.app/api/chat"

# Run the smoke tests
Write-Host "Running smoke tests against $env:CHAT_ENDPOINT"
node reports\STAGE_A_MOCK_20250823\smoke_test.js

# Results will be written to reports\STAGE_A_MOCK_20250823\05_SMOKE_RESULTS.md
Write-Host "`nSmoke test results have been written to:"
Write-Host "reports\STAGE_A_MOCK_20250823\05_SMOKE_RESULTS.md"
