# Starts Loki + Promtail + Grafana as native Windows processes (no Docker).
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ObsRoot = Join-Path $Root "tools\observability"
$BinDir = Join-Path $ObsRoot "bin"
$DataDir = Join-Path $ObsRoot "data"
$LokiData = Join-Path $DataDir "loki"
$GrafanaHome = Join-Path $ObsRoot "grafana"
$PidFile = Join-Path $ObsRoot "pids.json"
$LogsDir = Join-Path $Root "logs"

$LokiVer = "3.0.0"
$GrafanaVer = "11.0.0"

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Download-Zip([string]$Url, [string]$ZipPath) {
  Write-Host "  downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
}

function Ensure-Tools {
  Ensure-Dir $BinDir
  Ensure-Dir $LokiData
  Ensure-Dir $LogsDir

  $lokiExe = Join-Path $BinDir "loki.exe"
  if (-not (Test-Path $lokiExe)) {
    $zip = Join-Path $BinDir "loki.zip"
    Download-Zip "https://github.com/grafana/loki/releases/download/v$LokiVer/loki-windows-amd64.exe.zip" $zip
    Expand-Archive -Path $zip -DestinationPath $BinDir -Force
    Remove-Item $zip -Force
    $found = Get-ChildItem $BinDir -Filter "loki*.exe" | Select-Object -First 1
    if (-not $found) { throw "loki.exe missing after download" }
    if ($found.Name -ne "loki.exe") { Move-Item $found.FullName $lokiExe -Force }
  }

  $promtailExe = Join-Path $BinDir "promtail.exe"
  if (-not (Test-Path $promtailExe)) {
    $zip = Join-Path $BinDir "promtail.zip"
    Download-Zip "https://github.com/grafana/loki/releases/download/v$LokiVer/promtail-windows-amd64.exe.zip" $zip
    Expand-Archive -Path $zip -DestinationPath $BinDir -Force
    Remove-Item $zip -Force
    $found = Get-ChildItem $BinDir -Filter "promtail*.exe" | Select-Object -First 1
    if (-not $found) { throw "promtail.exe missing after download" }
    if ($found.Name -ne "promtail.exe") { Move-Item $found.FullName $promtailExe -Force }
  }

  $grafanaExe = Join-Path $GrafanaHome "bin\grafana-server.exe"
  if (-not (Test-Path $grafanaExe)) {
    Ensure-Dir $ObsRoot
    $zip = Join-Path $ObsRoot "grafana.zip"
    Download-Zip "https://dl.grafana.com/oss/release/grafana-$GrafanaVer.windows-amd64.zip" $zip
    $stage = Join-Path $ObsRoot "_grafana_stage"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $stage -Force
    Remove-Item $zip -Force
    $inner = Get-ChildItem $stage -Directory | Select-Object -First 1
    if (-not $inner) { throw "grafana zip layout unexpected" }
    if (Test-Path $GrafanaHome) { Remove-Item $GrafanaHome -Recurse -Force }
    Move-Item $inner.FullName $GrafanaHome
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Stop-Existing {
  if (-not (Test-Path $PidFile)) { return }
  try {
    $pids = Get-Content $PidFile -Raw | ConvertFrom-Json
    foreach ($name in @("grafana", "promtail", "loki")) {
      $procId = $pids.$name
      if ($procId) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Write-PromtailConfig {
  $apiLog = (Join-Path $LogsDir "api.log") -replace "\\", "/"
  $webLog = (Join-Path $LogsDir "web.log") -replace "\\", "/"
  $pos = ((Join-Path $DataDir "promtail-positions.yaml") -replace "\\", "/")
  @"
server:
  http_listen_address: 127.0.0.1
  http_listen_port: 9080
  grpc_listen_port: 0
  log_level: warn

positions:
  filename: $pos

clients:
  - url: http://127.0.0.1:3100/loki/api/v1/push

scrape_configs:
  - job_name: pmas-local-api
    static_configs:
      - targets: [localhost]
        labels:
          compose_service: api
          job: pmas-local
          __path__: $apiLog
  - job_name: pmas-local-web
    static_configs:
      - targets: [localhost]
        labels:
          compose_service: web
          job: pmas-local
          __path__: $webLog
"@ | Set-Content -Path (Join-Path $ObsRoot "promtail-runtime.yml") -Encoding UTF8
}

function Start-Native {
  if (-not (Test-Path (Join-Path $LogsDir "api.log"))) { New-Item -ItemType File -Path (Join-Path $LogsDir "api.log") | Out-Null }
  if (-not (Test-Path (Join-Path $LogsDir "web.log"))) { New-Item -ItemType File -Path (Join-Path $LogsDir "web.log") | Out-Null }

  Write-PromtailConfig

  $lokiConfig = Join-Path $PSScriptRoot "loki-local-config.yml"
  $loki = Start-Process -FilePath (Join-Path $BinDir "loki.exe") `
    -ArgumentList @("-config.file=$lokiConfig") `
    -WorkingDirectory $LokiData `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds 2

  $promtail = Start-Process -FilePath (Join-Path $BinDir "promtail.exe") `
    -ArgumentList @("-config.file=$(Join-Path $ObsRoot 'promtail-runtime.yml')") `
    -WorkingDirectory $DataDir `
    -WindowStyle Hidden `
    -PassThru

  $env:GF_SERVER_HTTP_ADDR = "127.0.0.1"
  $env:GF_SERVER_HTTP_PORT = "3186"
  $env:GF_SERVER_ROOT_URL = "http://127.0.0.1:3186"
  $env:GF_SECURITY_ADMIN_USER = $(if ($env:GRAFANA_ADMIN_USER) { $env:GRAFANA_ADMIN_USER } else { "admin" })
  $env:GF_SECURITY_ADMIN_PASSWORD = $(if ($env:GRAFANA_ADMIN_PASSWORD) { $env:GRAFANA_ADMIN_PASSWORD } else { "admin" })
  $env:GF_USERS_ALLOW_SIGN_UP = "false"
  $env:GF_AUTH_ANONYMOUS_ENABLED = "false"
  $env:GF_PATHS_PROVISIONING = Join-Path $PSScriptRoot "grafana\provisioning"
  $env:GF_PATHS_DATA = Join-Path $DataDir "grafana"
  Ensure-Dir $env:GF_PATHS_DATA

  # Point file provider at checked-in dashboards
  $dashboardsYml = Join-Path $env:GF_PATHS_PROVISIONING "dashboards\dashboards.yml"
  if (Test-Path $dashboardsYml) {
    # runtime override via GF env is enough; dashboards path in yml is /etc/... for Docker.
    # Write a local dashboards provider next to data.
    $localProv = Join-Path $DataDir "grafana-provisioning"
    Ensure-Dir (Join-Path $localProv "datasources")
    Ensure-Dir (Join-Path $localProv "dashboards")
    Copy-Item (Join-Path $PSScriptRoot "grafana\provisioning\datasources\loki.yml") (Join-Path $localProv "datasources\loki.yml") -Force
    @"
apiVersion: 1
providers:
  - name: PMAS
    orgId: 1
    folder: PMAS
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: $((Join-Path $PSScriptRoot 'grafana\dashboards') -replace '\\','/')
      foldersFromFilesStructure: false
"@ | Set-Content (Join-Path $localProv "dashboards\dashboards.yml") -Encoding UTF8

    # Local Loki URL (host, not docker service name)
    @"
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    uid: loki
    access: proxy
    url: http://127.0.0.1:3100
    isDefault: true
    editable: false
    jsonData:
      maxLines: 1000
"@ | Set-Content (Join-Path $localProv "datasources\loki.yml") -Encoding UTF8

    $env:GF_PATHS_PROVISIONING = $localProv
  }

  $grafana = Start-Process -FilePath (Join-Path $GrafanaHome "bin\grafana-server.exe") `
    -ArgumentList @("--homepath=$GrafanaHome") `
    -WorkingDirectory $GrafanaHome `
    -WindowStyle Hidden `
    -PassThru

  @{
    loki = $loki.Id
    promtail = $promtail.Id
    grafana = $grafana.Id
  } | ConvertTo-Json | Set-Content $PidFile -Encoding UTF8

  Write-Host "  Loki     pid=$($loki.Id)  http://127.0.0.1:3100"
  Write-Host "  Promtail pid=$($promtail.Id)"
  Write-Host "  Grafana  pid=$($grafana.Id)  http://127.0.0.1:3186"
}

Write-Host "Ensuring local observability binaries (first run downloads ~150MB)..."
Ensure-Tools
Write-Host "Stopping previous local observability processes (if any)..."
Stop-Existing
Write-Host "Starting Loki + Promtail + Grafana (native)..."
Start-Native
Write-Host "Observability ready."
