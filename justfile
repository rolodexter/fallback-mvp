dev:
    pwsh -File scripts/dev_detached.ps1 -Port 5173 -Cwd C:\dev\fallback-mvp

stop:
    pwsh -File scripts/dev_stop.ps1 -Port 5173 -Cwd C:\dev\fallback-mvp

logs:
    Get-Content logs/devserver-*.log -Wait
