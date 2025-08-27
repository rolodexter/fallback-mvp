# PowerShell script to test multi-step prompting with business unit query
Write-Host "Running multi-step prompting test with business unit query..." -ForegroundColor Cyan

# Configuration
$LOCAL_ENDPOINT = "http://localhost:5173/.netlify/functions/chat"
$QUERY = "Show me the performance of liferafts business unit"

Write-Host "Query: `"$QUERY`"" -ForegroundColor Yellow
Write-Host "Endpoint: $LOCAL_ENDPOINT" -ForegroundColor Yellow

# Prepare the request payload
$payload = @{
    message = $QUERY
    grounding = @{
        domain = "financial" # Set domain for better context
    }
} | ConvertTo-Json

Write-Host "Sending request..." -ForegroundColor Cyan
$startTime = Get-Date

try {
    # Make the API call
    $response = Invoke-RestMethod -Uri $LOCAL_ENDPOINT -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 60
    
    $endTime = Get-Date
    $responseTimeMs = [math]::Round(($endTime - $startTime).TotalMilliseconds)
    
    # Display results
    Write-Host "`n===== TEST RESULTS =====" -ForegroundColor Green
    Write-Host "✅ Response received in ${responseTimeMs}ms" -ForegroundColor Green
    Write-Host "✅ Answer type: $($response.type)" -ForegroundColor Green
    Write-Host "✅ Provenance: $($response.provenance ?? 'none')" -ForegroundColor Green
    
    # Display answer preview
    $answerPreview = $response.answer.Substring(0, [Math]::Min(300, $response.answer.Length))
    Write-Host "`nAnswer preview (first 300 chars):" -ForegroundColor Yellow
    Write-Host "$answerPreview..." -ForegroundColor White
    
    # Check for widgets
    if ($response.widgets -and $response.widgets.PSObject.Properties.Count -gt 0) {
        Write-Host "`n✅ Widgets found: $($response.widgets.PSObject.Properties.Count)" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️ No widgets in response" -ForegroundColor Yellow
    }
    
    # Save full response to file for inspection
    $response | ConvertTo-Json -Depth 10 | Out-File "tests/multi_step_test_response.json"
    Write-Host "`nFull response saved to tests/multi_step_test_response.json" -ForegroundColor Cyan
    
    Write-Host "`n✅ Test completed successfully" -ForegroundColor Green
    
} catch {
    Write-Host "Test failed: $_" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    
    # Try to get error details if available
    try {
        $errorDetails = $_.ErrorDetails.Message
        if ($errorDetails) {
            Write-Host "Error details: $errorDetails" -ForegroundColor Red
        }
    } catch {
        # No additional error details
    }
    
    Write-Host "`n❌ Test failed" -ForegroundColor Red
    exit 1
}
