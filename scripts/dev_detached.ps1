param(
  [int]$Port = 5173,
  [string]$Cwd = "C:\dev\fallback-mvp",
  [string]$Cmd = "npm run dev",
  [string]$LogDir = "logs",
  [string]$PidFile = ".devserver.pid",
  [int]$StartupWaitMs = 2000
)

Set-Location $Cwd

# Ensure logs directory
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir "devserver-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$pidPath = Join-Path $Cwd $PidFile

# 1) Kill any process bound to the dev port
$existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($existing) {
  try {
    $p = Get-Process -Id $existing.OwningProcess -ErrorAction Stop
    Write-Host "Killing existing dev server PID $($p.Id) on port $Port..."
    $p | Stop-Process -Force
    Start-Sleep -Milliseconds 300
  } catch { }
}

# 2) Kill previous PID if tracked
if (Test-Path $pidPath) {
  $oldPid = Get-Content $pidPath | Select-Object -First 1
  if ($oldPid) {
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
      Write-Host "Killing previous tracked PID $oldPid..."
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}

# 3) Start dev server DETACHED and tee logs
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "powershell.exe"
$psi.WorkingDirectory = $Cwd
# Use 'cmd /c' if your script relies on npm-cmd on Windows
$psi.Arguments = "-NoProfile -Command `"cmd /c $Cmd 1>> `"$logPath`" 2>&1`""
$psi.CreateNoWindow = $true
$psi.UseShellExecute = $false
$proc = [System.Diagnostics.Process]::Start($psi)
$proc | Out-Null

# Wait briefly and record PID
Start-Sleep -Milliseconds $StartupWaitMs
"$($proc.Id)" | Set-Content $pidPath -Encoding ascii

Write-Host "Dev server started (PID $($proc.Id)) on port $Port."
Write-Host "Logs: $logPath"
Write-Host "PID file: $pidPath"
