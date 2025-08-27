# PowerShell script to check multi-step prompting implementation

Write-Host "========== MULTI-STEP PROMPTING VERIFICATION ==========" -ForegroundColor Cyan

# Define paths
$llmProviderPath = "c:\dev\fallback-mvp\src\services\llmProvider.ts"
$chatFunctionPath = "c:\dev\fallback-mvp\netlify\functions\chat.ts"
$envExamplePath = "c:\dev\fallback-mvp\.env.example"

# Read files if they exist
try {
    $llmProviderContent = if (Test-Path $llmProviderPath) { Get-Content -Path $llmProviderPath -Raw } else { "" }
    $chatFunctionContent = if (Test-Path $chatFunctionPath) { Get-Content -Path $chatFunctionPath -Raw } else { "" }
    $envExampleContent = if (Test-Path $envExamplePath) { Get-Content -Path $envExamplePath -Raw } else { "" }
    
    Write-Host "Files loaded successfully" -ForegroundColor Green
} catch {
    Write-Host "Error reading files: $_" -ForegroundColor Red
    exit 1
}

# Define tests and run them
$tests = @(
    @{
        name = "Multi-step response function"
        check = { $chatFunctionContent -match "generateMultiStepResponse" }
    },
    @{
        name = "Placeholder extraction"
        check = { $chatFunctionContent -match "extractPlaceholders" }
    },
    @{
        name = "Skeleton stage"
        check = { $llmProviderContent -match "'skeleton'|`"skeleton`"" }
    },
    @{
        name = "Reasoning stage"
        check = { $llmProviderContent -match "'reasoning'|`"reasoning`"" }
    },
    @{
        name = "Polish stage"
        check = { $llmProviderContent -match "'polish'|`"polish`"" }
    },
    @{
        name = "Error handling with fallback"
        check = { $chatFunctionContent -match "Falling back to single-step response" }
    },
    @{
        name = "Detailed logging"
        check = { $chatFunctionContent -match "multiStepId" }
    },
    @{
        name = "Environment variable configuration"
        check = { $envExampleContent -match "ENABLE_MULTI_STEP" }
    },
    @{
        name = "Perplexity integration"
        check = { $llmProviderContent -match "callPerplexity" }
    },
    @{
        name = "Stage-specific temperature"
        check = { $llmProviderContent -match "temperature:" -and
                 ([regex]::Matches($llmProviderContent, "temperature:")).Count -ge 2 }
    }
)

# Run tests
$passCount = 0
$failCount = 0

Write-Host "`nRunning tests..." -ForegroundColor Yellow
foreach ($test in $tests) {
    $result = & $test.check
    if ($result) {
        Write-Host "[PASS] $($test.name)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "[FAIL] $($test.name)" -ForegroundColor Red
        $failCount++
    }
}

# Print summary
Write-Host "`n========== RESULTS ==========" -ForegroundColor Cyan
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
$percentage = [math]::Round(($passCount / $tests.Count) * 100)
Write-Host "Success rate: $percentage%" -ForegroundColor $(if ($percentage -eq 100) { "Green" } elseif ($percentage -ge 80) { "Yellow" } else { "Red" })

if ($failCount -eq 0) {
    Write-Host "`nAll checks passed! Multi-step prompting implementation looks complete." -ForegroundColor Green
} else {
    Write-Host "`nSome checks failed. Please address the issues above." -ForegroundColor Yellow
}
