# Start local/self-hosted Postgres via docker compose (db service only).
# Used by start.bat. Safe to re-run.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is required for local Postgres (db service)." -ForegroundColor Red
    Write-Host "        Install Docker Desktop, then re-run start.bat." -ForegroundColor Red
    exit 1
}

$envPath = Join-Path $Root ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "[ERROR] .env not found. Copy .env.example to .env and set POSTGRES_PASSWORD + SUPABASE_DB_URL." -ForegroundColor Red
    exit 1
}

# Ensure required Postgres env vars exist in process (compose interpolates them)
$envMap = @{}
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $i = $line.IndexOf("=")
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    $envMap[$k] = $v
}

foreach ($req in @("POSTGRES_PASSWORD")) {
    if (-not $envMap.ContainsKey($req) -or [string]::IsNullOrWhiteSpace($envMap[$req])) {
        Write-Host "[ERROR] .env missing required value: $req" -ForegroundColor Red
        exit 1
    }
    Set-Item -Path "Env:$req" -Value $envMap[$req]
}

if (-not $envMap.ContainsKey("POSTGRES_USER") -or [string]::IsNullOrWhiteSpace($envMap["POSTGRES_USER"])) {
    $envMap["POSTGRES_USER"] = "pmas"
}
if (-not $envMap.ContainsKey("POSTGRES_DB") -or [string]::IsNullOrWhiteSpace($envMap["POSTGRES_DB"])) {
    $envMap["POSTGRES_DB"] = "pmas"
}
Set-Item -Path "Env:POSTGRES_USER" -Value $envMap["POSTGRES_USER"]
Set-Item -Path "Env:POSTGRES_DB" -Value $envMap["POSTGRES_DB"]

foreach ($opt in @("PG_SHARED_BUFFERS", "PG_EFFECTIVE_CACHE_SIZE", "PG_WORK_MEM", "PG_MAINTENANCE_WORK_MEM", "PG_MAX_CONNECTIONS")) {
    if ($envMap.ContainsKey($opt) -and -not [string]::IsNullOrWhiteSpace($envMap[$opt])) {
        Set-Item -Path "Env:$opt" -Value $envMap[$opt]
    }
}

Write-Host "Starting Postgres (compose service: db)..."
docker compose -f docker-compose.yml up -d db
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] docker compose up -d db failed." -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for Postgres health..."
$ok = $false
$user = $env:POSTGRES_USER
$db = $env:POSTGRES_DB
for ($i = 1; $i -le 36; $i++) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker compose -f docker-compose.yml exec -T db pg_isready -U $user -d $db 2>$null | Out-Null
    $readyCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($readyCode -eq 0) {
        $ok = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ok) {
    Write-Host "[ERROR] Postgres did not become healthy in time." -ForegroundColor Red
    docker compose -f docker-compose.yml logs --tail=40 db
    exit 1
}

Write-Host "Postgres is healthy (localhost-only :5432)."
exit 0
