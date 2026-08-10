$ErrorActionPreference = "SilentlyContinue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PidFile = Join-Path $Root "tools\observability\pids-grafana.json"

if (-not (Test-Path $PidFile)) {
  Write-Host "No Grafana-only pid file found."
  exit 0
}

$pids = Get-Content $PidFile -Raw | ConvertFrom-Json
if ($pids.grafana) {
  Write-Host "Stopping Grafana (pid=$($pids.grafana))..."
  Stop-Process -Id $pids.grafana -Force -ErrorAction SilentlyContinue
}
Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Grafana stopped."
