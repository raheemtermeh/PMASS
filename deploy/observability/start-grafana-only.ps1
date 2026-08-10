# Grafana only — connect to Loki at $LokiUrl (local or SSH-tunneled server).
param(
  [string]$LokiUrl = "http://127.0.0.1:3100"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ObsRoot = Join-Path $Root "tools\observability"
$BinDir = Join-Path $ObsRoot "bin"
$DataDir = Join-Path $ObsRoot "data"
$GrafanaHome = Join-Path $ObsRoot "grafana"
$PidFile = Join-Path $ObsRoot "pids-grafana.json"

$GrafanaVer = "11.0.0"

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Download-Zip([string]$Url, [string]$ZipPath) {
  Write-Host "  downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
}

function Ensure-Grafana {
  Ensure-Dir $BinDir
  Ensure-Dir $DataDir
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
    if ($pids.grafana) { Stop-Process -Id $pids.grafana -Force -ErrorAction SilentlyContinue }
  } catch {}
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Start-Grafana {
  $lokiUrl = $LokiUrl.TrimEnd("/")
  $localProv = Join-Path $DataDir "grafana-provisioning-remote"
  Ensure-Dir (Join-Path $localProv "datasources")
  Ensure-Dir (Join-Path $localProv "dashboards")

  @"
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    uid: loki
    access: proxy
    url: $lokiUrl
    isDefault: true
    editable: false
    jsonData:
      maxLines: 1000
"@ | Set-Content (Join-Path $localProv "datasources\loki.yml") -Encoding UTF8

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

  $env:GF_SERVER_HTTP_ADDR = "127.0.0.1"
  $env:GF_SERVER_HTTP_PORT = "3186"
  $env:GF_SERVER_ROOT_URL = "http://127.0.0.1:3186"
  $env:GF_SECURITY_ADMIN_USER = $(if ($env:GRAFANA_ADMIN_USER) { $env:GRAFANA_ADMIN_USER } else { "admin" })
  $env:GF_SECURITY_ADMIN_PASSWORD = $(if ($env:GRAFANA_ADMIN_PASSWORD) { $env:GRAFANA_ADMIN_PASSWORD } else { "admin" })
  $env:GF_USERS_ALLOW_SIGN_UP = "false"
  $env:GF_AUTH_ANONYMOUS_ENABLED = "false"
  $env:GF_PATHS_PROVISIONING = $localProv
  $env:GF_PATHS_DATA = Join-Path $DataDir "grafana-remote"
  Ensure-Dir $env:GF_PATHS_DATA

  $grafana = Start-Process -FilePath (Join-Path $GrafanaHome "bin\grafana-server.exe") `
    -ArgumentList @("--homepath=$GrafanaHome") `
    -WorkingDirectory $GrafanaHome `
    -WindowStyle Hidden `
    -PassThru

  @{ grafana = $grafana.Id; loki_url = $lokiUrl } | ConvertTo-Json | Set-Content $PidFile -Encoding UTF8
  Write-Host "  Grafana pid=$($grafana.Id)  http://127.0.0.1:3186"
  Write-Host "  Loki datasource: $lokiUrl"
}

Write-Host "Ensuring Grafana binary..."
Ensure-Grafana
Write-Host "Stopping previous Grafana-only instance..."
Stop-Existing
Write-Host "Starting Grafana..."
Start-Grafana
Write-Host "Grafana ready."
