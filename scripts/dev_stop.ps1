param(
  [int]$Port = 5173,
  [string]$Cwd = "C:\dev\fallback-mvp",
  [string]$PidFile = ".devserver.pid"
)
Set-Location $Cwd
$pidPath = Join-Path $Cwd $PidFile

if (Test-Path $pidPath) {
  $pid = Get-Content $pidPath | Select-Object -First 1
  if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped dev server PID $pid."
  }
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
} else {
  # Fallback: kill by port
  $existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($existing) {
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped process on port $Port."
  } else {
    Write-Host "No dev server found."
  }
}
