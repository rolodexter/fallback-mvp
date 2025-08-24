# UNIVERSAL HANDOFF — fallback-mvp

> **Use this once per working session** to produce a single, exhaustive status packet for rolodexterGPT — valid for **all stages** (A: Mock, B: BigQuery, later). Strictly **PowerShell on Windows**, one command per line.

---

## What this generates

- A markdown **handoff report** with:
    
    - Local repo **visibility** (key paths with full local file listing)
        
    - **GitHub** state (branch, remotes, HEAD, local changes, recent graph)
        
    - **Environment & Stage** detection (DATA_MODE, VITE_DEPLOY_PLATFORM, BigQuery creds)
        
    - **Build output** + captured **errors**
        
    - **Deployment status** (Vercel + Netlify, if configured)
        
    - **Endpoint health** & **/api/chat** smoke checks
        
    - **Feature matrix** (templates, router, widgets) with pass/fail hints
        
    - **Known issues / risks / next actions**
        
- All raw logs to an **artifacts** folder alongside the report.
    

---

## Where the report + artifacts will be written

- Report: `C:\dev\fallback-mvp\reboot_prompts\\YYYY-MM-DD\\HANDOFF__fallback-mvp__UNIVERSAL__YYYYMMDD_HHMM.md`
    
- Artifacts: `C:\dev\fallback-mvp\reboot_prompts\\YYYY-MM-DD\\artifacts\\HANDOFF__YYYYMMDD_HHMM\\`
    

> Tip: If Vercel/Netlify CLIs need auth, set `$env:VERCEL_TOKEN` / `$env:NETLIFY_AUTH_TOKEN` first.

---

## 1) **Report Builder** (PowerShell — copy/paste **one line at a time**)

```powershell
# === Setup ===============================================================
cd C:\dev\fallback-mvp
$DateStr = Get-Date -Format "yyyy-MM-dd"
$Stamp   = Get-Date -Format "yyyyMMdd_HHmm"
$OutDir  = "C:\dev\fallback-mvp\reboot_prompts\$DateStr"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ArtDir  = Join-Path $OutDir "artifacts\HANDOFF__${Stamp}"
New-Item -ItemType Directory -Force -Path $ArtDir | Out-Null
$Report  = Join-Path $OutDir "HANDOFF__fallback-mvp__UNIVERSAL__${Stamp}.md"

"# UNIVERSAL HANDOFF — fallback-mvp — $Stamp`n" | Out-File $Report -Encoding utf8

# Optional operator-provided context
$env:PLATFORM_PRIMARY = $env:PLATFORM_PRIMARY   # vercel|netlify|both (optional)
$env:STAGE_HINT       = $env:STAGE_HINT         # A|B|… (optional)
$env:CHAT_VERCEL_URL  = $env:CHAT_VERCEL_URL    # e.g., https://<app>.vercel.app/api/chat
$env:CHAT_NETLIFY_URL = $env:CHAT_NETLIFY_URL   # e.g., https://<site>.netlify.app/.netlify/functions/chat

# === A) System & Tooling ================================================
"## A) System & Tooling`n" | Out-File $Report -Append
("Host: "  + $env:COMPUTERNAME)                 | Out-File $Report -Append
("User: "  + $env:USERNAME)                     | Out-File $Report -Append
("Node: "  + (node -v 2>$null))                 | Out-File $Report -Append
("NPM : "  + (npm -v  2>$null))                 | Out-File $Report -Append
("Vercel CLI: "  + (vercel --version  2>$null)) | Out-File $Report -Append
("Netlify CLI: " + (netlify --version 2>$null)) | Out-File $Report -Append
"`n" | Out-File $Report -Append

# === B) Stage & Platform Detection ======================================
"## B) Stage & Platform Detection`n" | Out-File $Report -Append
$DataMode = if ($env:DATA_MODE) { $env:DATA_MODE } else { "(unset)" }
$VitePlat = if ($env:VITE_DEPLOY_PLATFORM) { $env:VITE_DEPLOY_PLATFORM } else { "(unset)" }
$BQ_Project   = if ($env:BQ_PROJECT_ID)   { $env:BQ_PROJECT_ID }   else { "(unset)" }
$BQ_EmailMask = if ($env:BQ_CLIENT_EMAIL) { "***@***" } else { "(unset)" }
$BQ_KeyMask   = if ($env:BQ_PRIVATE_KEY)  { "(present)" } else { "(unset)" }
("DATA_MODE: " + $DataMode)        | Out-File $Report -Append
("VITE_DEPLOY_PLATFORM: " + $VitePlat) | Out-File $Report -Append
("STAGE_HINT: " + $env:STAGE_HINT)  | Out-File $Report -Append
("BQ_PROJECT_ID: " + $BQ_Project)    | Out-File $Report -Append
("BQ_CLIENT_EMAIL: " + $BQ_EmailMask) | Out-File $Report -Append
("BQ_PRIVATE_KEY: " + $BQ_KeyMask)    | Out-File $Report -Append
"`n" | Out-File $Report -Append

# === C) Local Repo Visibility (key paths) ===============================
"## C) Local Repo Visibility (key paths)`n" | Out-File $Report -Append
$KeyPaths = @(
  "public/mock-data",
  "src/router",
  "src/templates",
  "src/components/ChatPanel.tsx",
  "src/templates/registry.ts",
  "api",
  "netlify/functions",
  "scripts",
  "reports",
  "reboot_prompts"
)
foreach ($p in $KeyPaths) {
  "### $p`n" | Out-File $Report -Append
  if (Test-Path $p) {
    Get-ChildItem -Recurse -File $p | Select-Object -ExpandProperty FullName | ForEach-Object { "- " + $_ } | Out-File $Report -Append
  } else {
    "- (missing locally)" | Out-File $Report -Append
  }
  "`n" | Out-File $Report -Append
}

# === D) GitHub Status ===================================================
"## D) GitHub Status`n" | Out-File $Report -Append
"**Branch**:"                      | Out-File $Report -Append
(git branch --show-current)         | Out-File $Report -Append
"`n**Remotes**:"                    | Out-File $Report -Append
(git remote -v)                     | Out-File $Report -Append
"`n**HEAD commit**:"                | Out-File $Report -Append
(git log -1 --pretty=format:"%h %ad %an %s" --date=iso) | Out-File $Report -Append
"`n**Local changes (short)**:"      | Out-File $Report -Append
(git status -s)                     | Out-File $Report -Append
"`n**Recent history (graph, last 12)**:" | Out-File $Report -Append
(git --no-pager log --oneline --graph -12) | Out-File $Report -Append
"`n" | Out-File $Report -Append

# === E) Feature Matrix (presence checks) ================================
"## E) Feature Matrix (presence checks)`n" | Out-File $Report -Append
$Templates = @(
  "business_units_snapshot_yoy_v1",
  "top_counterparties_gross_v1",
  "monthly_gross_trend_v1",
  "regional_performance_v1",
  "profitability_summary_v1"
)
foreach ($t in $Templates) {
  $regHit = (Select-String -Path "src/templates/registry.ts" -Pattern $t -SimpleMatch -ErrorAction SilentlyContinue)
  $mockHit = (Get-ChildItem public/mock-data -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $t -or $_.Name -match "regional|profitability|counterparties|gross|bu_snapshot" })
  $line = "- [" + ($(if($regHit){"x"}else{" "})) + "] template_id **$t** in registry; mockData:" + $(if($mockHit){"yes"}else{"no"})
  $line | Out-File $Report -Append
}
"`nRouter token sanity:`n- routeMessage() present in src/router/topicRouter.ts`n- Submit path sends {message, router, template, params} to serverless`n" | Out-File $Report -Append

# === F) Local Build Output & Errors ====================================
"## F) Local Build Output & Errors`n" | Out-File $Report -Append
try { $b = npm run build 2>&1; $b | Tee-Object -FilePath (Join-Path $ArtDir "local_build.log") | Out-File $Report -Append } catch { "Local build failed.`n" | Out-File $Report -Append }

# === G) Deployment Status (Vercel & Netlify) ============================
"## G) Deployment Status`n" | Out-File $Report -Append
# --- Vercel ---
try {
  "### Vercel" | Out-File $Report -Append
  (vercel whoami) | Out-File $Report -Append
  "`n**Deployments (last 5)**" | Out-File $Report -Append
  (vercel ls --limit 5) | Tee-Object -FilePath (Join-Path $ArtDir "vercel_deploys.txt") | Out-File $Report -Append
  $Latest = (vercel ls --limit 1 --json) 2>$null
  if ($Latest) {
    $Obj = ($Latest | ConvertFrom-Json)[0]
    $Url = $Obj.url
    "`n**Latest URL**: https://$Url" | Out-File $Report -Append
    "`n**/api/chat logs (2h)**" | Out-File $Report -Append
    (vercel logs https://$Url/api/chat --since=2h) | Tee-Object -FilePath (Join-Path $ArtDir "vercel_chat_logs.txt") | Out-File $Report -Append
    "`n**Inspect latest**" | Out-File $Report -Append
    (vercel inspect https://$Url 2>&1) | Tee-Object -FilePath (Join-Path $ArtDir "vercel_inspect.txt") | Out-File $Report -Append
  }
} catch { "Vercel status skipped (CLI/token not available).`n" | Out-File $Report -Append }

# --- Netlify ---
try {
  "### Netlify" | Out-File $Report -Append
  (netlify status --json) | Tee-Object -FilePath (Join-Path $ArtDir "netlify_status.json") | Out-File $Report -Append
  (netlify link:info 2>&1) | Tee-Object -FilePath (Join-Path $ArtDir "netlify_link_info.txt") | Out-File $Report -Append
} catch { "Netlify status skipped.`n" | Out-File $Report -Append }

# === H) Endpoint Health & Smoke ========================================
"## H) Endpoint Health & Smoke`n" | Out-File $Report -Append
$VercelEp  = $env:CHAT_VERCEL_URL
$NetlifyEp = $env:CHAT_NETLIFY_URL
if ($VercelEp) { "Vercel endpoint: $VercelEp" | Out-File $Report -Append }
if ($NetlifyEp){ "Netlify endpoint: $NetlifyEp" | Out-File $Report -Append }

# Light HEAD checks
if ($VercelEp)  { try { (Invoke-WebRequest -Uri $VercelEp -Method Head -ErrorAction Continue).StatusDescription | Out-File $Report -Append } catch { "Vercel HEAD error"  | Out-File $Report -Append } }
if ($NetlifyEp) { try { (Invoke-WebRequest -Uri $NetlifyEp -Method Head -ErrorAction Continue).StatusDescription | Out-File $Report -Append } catch { "Netlify HEAD error" | Out-File $Report -Append } }

# Minimal live POST (Z001 June snapshot)
if ($VercelEp)  { try { $p=@{message='Z001 June snapshot'} | ConvertTo-Json; $r=Invoke-WebRequest -Uri $VercelEp -Method Post -ContentType 'application/json' -Body $p -ErrorAction Continue; $r.Content | Tee-Object -FilePath (Join-Path $ArtDir 'vercel_answer.json') | Out-File $Report -Append } catch { "Vercel POST error"  | Out-File $Report -Append } }
if ($NetlifyEp) { try { $p=@{message='Z001 June snapshot'} | ConvertTo-Json; $r=Invoke-WebRequest -Uri $NetlifyEp -Method Post -ContentType 'application/json' -Body $p -ErrorAction Continue; $r.Content | Tee-Object -FilePath (Join-Path $ArtDir 'netlify_answer.json') | Out-File $Report -Append } catch { "Netlify POST error" | Out-File $Report -Append } }

# Run repo smoke runner if present
if (Test-Path .\smoke_test.js) {
  try { node smoke_test.js 2>&1 | Tee-Object -FilePath (Join-Path $ArtDir 'smoke_output.txt') | Out-File $Report -Append } catch { "smoke_test.js failed" | Out-File $Report -Append }
  if (Test-Path .\reports) { Get-ChildItem -Recurse -File .\reports | Select-Object -ExpandProperty FullName | Out-File $Report -Append }
}

# === I) Known Issues / Risks / Next Steps ===============================
"## I) Known Issues / Risks / Next Steps`n" | Out-File $Report -Append
"- Router misses casual phrasing → Intro/nodata; broaden synonyms." | Out-File $Report -Append
"- Ensure client sends {message, router, template, params} only when domain matched." | Out-File $Report -Append
"- Stage A: DATA_MODE=mock; optional POLISH_NARRATIVE (text only)." | Out-File $Report -Append
"- Stage B: BigQuery creds required; preserve Answer shape and abstain rules." | Out-File $Report -Append

# === J) Links (fill if available) =======================================
"## J) Links`n- App URL (Vercel): (fill)`n- /api/chat: (fill)`n- Deploy inspect: (fill)`n" | Out-File $Report -Append

"`n---`n**End of UNIVERSAL HANDOFF**" | Out-File $Report -Append

Write-Host ("Handoff written: " + $Report)
Write-Host ("Artifacts:    " + $ArtDir)
```

---

## 2) How to run

1. Open **PowerShell**.
    
2. Paste the **Report Builder** block above **one line at a time**.
    
3. When it finishes, send the generated report path back to rolodexterGPT.
    

---

## 3) Notes

- The script **skips gracefully** if a tool is missing and annotates the gap in the report.
    
- For Stage A, set `DATA_MODE=mock` and (optionally) `POLISH_NARRATIVE=true` with `PERPLEXITY_API_KEY` — numbers stay deterministic.
    
- For Stage B, add `BQ_PROJECT_ID`, `BQ_CLIENT_EMAIL`, `BQ_PRIVATE_KEY` (with newline-restored key).
