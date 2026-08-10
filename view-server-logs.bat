@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  ========================================
echo   PMAS — Grafana local + server logs
echo  ========================================
echo.
echo  Grafana runs on YOUR PC:  http://127.0.0.1:3186
echo  Logs are collected on the SERVER (Loki + Promtail in Docker).
echo  An SSH tunnel forwards server Loki (:3100) to your PC.
echo.

set "SSH_HOST=server.linooxel.com"
set "SSH_PORT=185"
set "SSH_USER=root"

if exist ".deploy.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /i "PMAS_SSH_" ".deploy.env"`) do (
    if /i "%%A"=="PMAS_SSH_HOST" set "SSH_HOST=%%B"
    if /i "%%A"=="PMAS_SSH_PORT" set "SSH_PORT=%%B"
    if /i "%%A"=="PMAS_SSH_USER" set "SSH_USER=%%B"
  )
)

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /i "GRAFANA_ADMIN_" ".env" 2^>nul`) do (
  set "%%A=%%B"
)

where ssh >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] OpenSSH client (ssh) not found.
  echo         Install "OpenSSH Client" from Windows Optional Features.
  pause
  exit /b 1
)

echo  [1/2] Opening SSH tunnel (keep this window OPEN)
echo        ssh -p %SSH_PORT% -L 3100:127.0.0.1:3100 %SSH_USER%@%SSH_HOST%
echo        Enter SSH password when prompted.
start "PMAS Loki tunnel" cmd /k "ssh -p %SSH_PORT% -L 3100:127.0.0.1:3100 -N %SSH_USER%@%SSH_HOST%"

echo  Waiting for tunnel...
timeout /t 5 /nobreak >nul

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:3100/ready | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo  [WARN] Loki not reachable yet on localhost:3100.
  echo         Make sure the SSH tunnel window is connected.
  echo         Server needs Loki deployed: run update-server.bat once after docker-compose.logs.yml is on server.
  echo.
)

echo  [2/2] Starting Grafana (local)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\observability\start-grafana-only.ps1" -LokiUrl "http://127.0.0.1:3100"
if errorlevel 1 (
  echo  [ERROR] Failed to start Grafana.
  pause
  exit /b 1
)

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3186"

echo.
echo  Done.
echo    Grafana: http://127.0.0.1:3186  ^(admin / admin^)
echo    LogQL:   {compose_service="api"} |= "http_request"
echo.
echo  Keep "PMAS Loki tunnel" window open while viewing logs.
echo  Stop Grafana: stop-server-logs.bat
echo.
pause
