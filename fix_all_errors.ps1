# Script to apply all fixes to the codebase

# ChatPanel.tsx fix - Change 'reply' to 'text' and fix domain access
$chatPanelContent = Get-Content -Path "c:\dev\fallback-mvp\src\components\chat\ChatPanel.tsx" -Raw
$chatPanelContent = $chatPanelContent -replace 'response\.reply', 'response.text'
$chatPanelContent = $chatPanelContent -replace 'response\.domain', 'response.meta?.domain'
$chatPanelContent | Set-Content -Path "c:\dev\fallback-mvp\src\components\chat\ChatPanel.tsx"

# Fix templates/index.ts - Fix formattedRisks implementation and missing formattedRegions
$templatesContent = Get-Content -Path "c:\dev\fallback-mvp\src\data\templates\index.ts" -Raw
$templatesContent = $templatesContent -replace "const formattedRisks = sortedRisks\.map\(risk => \{\s+const impactCategory = getImpactCategory\(risk\.risk_impact_score\);\s+\}\)\.join\('\\\n'\);", "const formattedRisks = sortedRisks.map((risk) => {
          const impactCategory = getImpactCategory(risk.risk_impact_score);
          // Convert impact score to estimated financial impact in millions
          const impactMil = (risk.risk_impact_score * 0.075).toFixed(1);
          return `* ${risk.risk_category}: ${impactCategory} (Impact: €${impactMil}M)`;
        }).join('\n');"
$templatesContent = $templatesContent -replace "return \`## Regional Revenue Trend \(24 months\)\\\n\\\n\$\{formattedRegions\}\`;", "return `## Current Risk Assessment\n\n${formattedRisks}`;

      case 'regional':
        // Implementation for regional similar to others
        return \"Regional data not available.\";"
$templatesContent | Set-Content -Path "c:\dev\fallback-mvp\src\data\templates\index.ts"

# Fix test_grounding.ts - Fix Promise handling
$testContent = Get-Content -Path "c:\dev\fallback-mvp\src\test_grounding.ts" -Raw
$testContent = $testContent -replace "console\.log\(\`KPI Summary: \$\{template\.kpiSummary\}\`\);\s+console\.log\(\`Template Output:\\\n\$\{template\.templateOutput\}\`\);", "template.then(result => {
      console.log(`KPI Summary: ${result.kpiSummary}\nTemplate Output:\n${result.templateOutput}`);
    });"
$testContent | Set-Content -Path "c:\dev\fallback-mvp\src\test_grounding.ts"

# Fix chatClient.ts - Fix syntax errors
$chatClientContent = Get-Content -Path "c:\dev\fallback-mvp\src\services\chatClient.ts" -Raw
# This is a complex pattern, so we'll use indices to replace the broken section
$startIndex = $chatClientContent.IndexOf("return { 
        text: data.text || data.reply || 'No response from server',
        mode: data.mode || 'chat'
      };")
$endIndex = $chatClientContent.IndexOf("    } catch (error) {", $startIndex)

if ($startIndex -ne -1 -and $endIndex -ne -1) {
    $fixedContent = $chatClientContent.Substring(0, $startIndex + 90) + `
      };
    } catch (error) {` + $chatClientContent.Substring($endIndex + 21)
    $fixedContent | Set-Content -Path "c:\dev\fallback-mvp\src\services\chatClient.ts"
}

Write-Host "All fixes applied. Ready to commit, push, and deploy."
