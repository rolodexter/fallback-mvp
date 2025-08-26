param(
  [string]$SiteUrl
)

# Run smoke tests against the deployed endpoint
# Priority: explicit CHAT_ENDPOINT env -> parameter SiteUrl -> placeholder
if (-not $env:CHAT_ENDPOINT) {
  if ($SiteUrl) {
    $env:CHAT_ENDPOINT = ("$SiteUrl".TrimEnd('/')) + "/api/chat"
  } else {
    # Replace with your actual Netlify site URL if not set
    $env:CHAT_ENDPOINT = "https://your-site.netlify.app/api/chat"
  }
}

Write-Host "Running smoke tests against $env:CHAT_ENDPOINT"
node reports\STAGE_A_MOCK_20250823\smoke_test.js

Write-Host "`nSmoke test results have been written to:"
Write-Host "reports\STAGE_A_MOCK_20250823\05_SMOKE_RESULTS.md"
