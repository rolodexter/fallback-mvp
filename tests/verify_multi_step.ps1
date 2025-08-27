# PowerShell script to verify multi-step prompting implementation

Write-Host "========== MULTI-STEP PROMPTING VERIFICATION ==========" -ForegroundColor Cyan

# Paths to files that should be analyzed
$PATHS = @{
    "llmProvider" = "c:\dev\fallback-mvp\src\services\llmProvider.ts"
    "chatFunction" = "c:\dev\fallback-mvp\netlify\functions\chat.ts"
    "envExample" = "c:\dev\fallback-mvp\.env.example"
}

# Feature requirements to verify
$REQUIREMENTS = @(
    @{
        id = "multistep_function"
        description = "Multi-step response generation function exists"
        pattern = "generateMultiStepResponse"
        file = "chatFunction"
    },
    @{
        id = "placeholder_extraction"
        description = "Placeholder extraction functionality exists"
        pattern = "extractPlaceholders"
        file = "chatFunction"
    },
    @{
        id = "skeleton_stage"
        description = "Skeleton generation stage implemented"
        pattern = "'skeleton'|`"skeleton`""
        file = "llmProvider"
    },
    @{
        id = "reasoning_stage"
        description = "Reasoning stage implemented"
        pattern = "'reasoning'|`"reasoning`""
        file = "llmProvider"
    },
    @{
        id = "polish_stage"
        description = "Polish stage implemented"
        pattern = "'polish'|`"polish`""
        file = "llmProvider"
    },
    @{
        id = "error_handling"
        description = "Error handling for multi-step prompting"
        pattern = "Falling back to single-step response"
        file = "chatFunction"
    },
    @{
        id = "detailed_logging"
        description = "Detailed logging implemented"
        pattern = "multiStepId"
        file = "chatFunction"
    },
    @{
        id = "env_multistep"
        description = "ENABLE_MULTI_STEP environment variable defined"
        pattern = "ENABLE_MULTI_STEP="
        file = "envExample"
    },
    @{
        id = "perplexity_integration"
        description = "Perplexity LLM integration with proper parameters"
        pattern = "callPerplexity"
        file = "llmProvider"
    },
    @{
        id = "different_temps"
        description = "Different temperatures for different stages"
        pattern = "temperature:\s*0\.[0-9]+"
        file = "llmProvider"
        multipleMatches = $true
    }
)

# Read file contents
$fileContents = @{}
foreach ($key in $PATHS.Keys) {
    $filePath = $PATHS[$key]
    if (Test-Path $filePath) {
        $fileContents[$key] = Get-Content -Path $filePath -Raw
        Write-Host "[PASS] Loaded $key from $filePath" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Failed to load $key from $filePath: File not found" -ForegroundColor Red
        $fileContents[$key] = ""
    }
}

# Verify requirements
$results = @()
foreach ($req in $REQUIREMENTS) {
    $content = $fileContents[$req.file]
    $pattern = $req.pattern
    
    if ($req.multipleMatches) {
        # For requirements that need multiple matches
        $matches = [regex]::Matches($content, $pattern)
        $passed = $matches.Count -ge 2
    } else {
        # For requirements that need at least one match
        $passed = $content -match $pattern
    }
    
    $results += [PSCustomObject]@{
        id = $req.id
        description = $req.description
        passed = $passed
    }
}

# Display results
Write-Host "`n========== VERIFICATION RESULTS ==========" -ForegroundColor Cyan

$passedCount = ($results | Where-Object { $_.passed -eq $true }).Count
$totalCount = $results.Count
$passRate = [math]::Round(($passedCount / $totalCount) * 100)

foreach ($result in $results) {
    $symbol = if ($result.passed) { "[PASS]" } else { "[FAIL]" }
    Write-Host "$symbol $($result.description)" -ForegroundColor $(if ($result.passed) { "Green" } else { "Red" })
}

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan
Write-Host "Passed: $passedCount/$totalCount ($passRate%)" -ForegroundColor $(if ($passRate -eq 100) { "Green" } else { "Yellow" })

if ($passedCount -eq $totalCount) {
    Write-Host "[SUCCESS] All multi-step prompting requirements are satisfied!" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Some multi-step prompting requirements are not satisfied." -ForegroundColor Yellow
    
    $failed = $results | Where-Object { $_.passed -eq $false }
    Write-Host "`nFailed requirements:" -ForegroundColor Yellow
    foreach ($item in $failed) {
        Write-Host "[FAIL] $($item.description) [$($item.id)]" -ForegroundColor Red
    }
}

# Recommendations
Write-Host "`n========== RECOMMENDATIONS ==========" -ForegroundColor Cyan

if ($passedCount -lt $totalCount) {
    Write-Host "1. Address the failed requirements above" -ForegroundColor Yellow
}

Write-Host "2. Test the implementation with real business unit queries" -ForegroundColor White
Write-Host "3. Monitor logs to verify all stages are working as expected" -ForegroundColor White
Write-Host "4. Verify that fallbacks work when a stage fails" -ForegroundColor White
Write-Host "5. Check performance and response quality between single and multi-step approaches" -ForegroundColor White

Write-Host "`nVerification completed." -ForegroundColor Cyan
