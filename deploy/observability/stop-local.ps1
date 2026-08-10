$ErrorActionPreference = "SilentlyContinue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PidFile = Join-Path $Root "tools\observability\pids.json"

if (-not (Test-Path $PidFile)) {
  Write-Host "No local observability pid file found."
  exit 0
}

$pids = Get-Content $PidFile -Raw | ConvertFrom-Json
foreach ($name in @("grafana", "promtail", "loki")) {
  $procId = $pids.$name
  if ($procId) {
    Write-Host "Stopping $name (pid=$procId)..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}
Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Local observability stopped."
