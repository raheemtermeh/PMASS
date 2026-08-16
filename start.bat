@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   PMAS - DB + API + Frontend + Logs
echo  ========================================
echo.
echo  Ports:
echo    Frontend  http://localhost:3000
echo    API       http://localhost:8080
echo    Postgres  127.0.0.1:5432 (Docker, localhost-only)
echo    Grafana   http://127.0.0.1:3186
echo.

if not exist ".env" (
  echo  [ERROR] .env not found. Copy .env.example to .env and fill values.
  pause
  exit /b 1
)

where go >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Go is not in PATH.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] npm is not in PATH.
  pause
  exit /b 1
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] PowerShell is required for local stack helpers.
  pause
  exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Docker is required for self-hosted Postgres.
  echo         Install Docker Desktop, then re-run start.bat.
  pause
  exit /b 1
)

if not exist "pmas-live\node_modules\" (
  echo  [info] Installing frontend dependencies...
  pushd pmas-live
  call npm install
  if errorlevel 1 (
    echo  [ERROR] npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "logs\" mkdir logs
if not exist "logs\api.log" type nul > "logs\api.log"
if not exist "logs\web.log" type nul > "logs\web.log"

REM Load optional Grafana + Postgres settings from .env (do not override vars already set)
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /i "GRAFANA_ADMIN_ POSTGRES_ PG_ SUPABASE_DB_URL" ".env"`) do (
  if not defined %%A set "%%A=%%B"
)

echo  [1/4] Starting self-hosted Postgres (Docker db)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\start-db.ps1"
if errorlevel 1 (
  echo  [ERROR] Failed to start Postgres.
  pause
  exit /b 1
)

echo  [2/4] Starting Loki + Promtail + Grafana (native, no Docker)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\observability\start-local.ps1"
if errorlevel 1 (
  echo  [ERROR] Failed to start local observability stack.
  pause
  exit /b 1
)

echo  [3/4] Starting API on http://localhost:8080
start "PMAS API" /D "%~dp0" cmd /k ""%~dp0deploy\dev-run-api.bat""

timeout /t 2 /nobreak >nul

echo  [4/4] Starting Frontend on http://localhost:3000
start "PMAS Frontend" /D "%~dp0pmas-live" cmd /k ""%~dp0deploy\dev-run-web.bat""

echo  Waiting for Frontend :3000 ...
set "READY=0"
for /l %%I in (1,1,30) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:3000).StatusCode } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :frontend_ready
  )
  timeout /t 1 /nobreak >nul
)

:frontend_ready
if "%READY%"=="1" (
  echo  Frontend is up on http://localhost:3000
) else (
  echo  [WARN] Frontend not responding on :3000 yet.
  echo         Check the "PMAS Frontend" window for errors.
)

start "" "http://localhost:3000"
start "" "http://127.0.0.1:3186"

echo.
echo  Done.
echo    App:      http://localhost:3000
echo    API:      http://localhost:8080
echo    Postgres: 127.0.0.1:5432  (Docker, localhost-only)
echo    Grafana:  http://127.0.0.1:3186
echo.
echo  Stop logs stack: stop-observability.bat
echo  Stop Postgres:   docker compose stop db
echo  Stop app: close the API / Frontend windows
echo.
pause
