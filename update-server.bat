@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  ========================================
echo   PMAS server update
echo  ========================================
echo  Target stack: api + web + gateway (:3185)
echo  Grafana/Loki are NOT deployed to the server.
echo.
echo  1) Push app code to GitHub first (master/main)
echo  2) This script uploads compose/nginx/update.sh from this PC
echo  3) Builds and restarts Docker on the server
echo.

if not exist "deploy\remote_update.py" (
  echo  [ERROR] deploy\remote_update.py not found. Run from repo root.
  pause
  exit /b 1
)
if not exist "deploy\update.sh" (
  echo  [ERROR] deploy\update.sh not found.
  pause
  exit /b 1
)
if not exist "docker-compose.yml" (
  echo  [ERROR] docker-compose.yml not found.
  pause
  exit /b 1
)
if not exist "deploy\nginx.conf" (
  echo  [ERROR] deploy\nginx.conf not found.
  pause
  exit /b 1
)
if not exist ".env" (
  echo  [ERROR] .env not found.
  echo         The updater securely sends this file to the server without committing it.
  pause
  exit /b 1
)

if not exist ".deploy.env" (
  echo  [WARN] .deploy.env not found.
  echo         Copy .deploy.env.example to .deploy.env and set PMAS_SSH_PASS.
  echo         Or enter the SSH password when asked.
  echo.
)

where py >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo  [ERROR] Python not found. Install Python 3 and retry.
    pause
    exit /b 1
  )
  set "PY=python"
) else (
  set "PY=py -3"
)

%PY% -c "import paramiko" >nul 2>&1
if errorlevel 1 (
  echo  Installing paramiko...
  %PY% -m pip install --user paramiko
  if errorlevel 1 (
    %PY% -m pip install paramiko
  )
  if errorlevel 1 (
    echo  [ERROR] Could not install paramiko.
    pause
    exit /b 1
  )
)

%PY% "%~dp0deploy\remote_update.py"
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  echo  [ERROR] Server update failed ^(exit %ERR%^).
  echo  Check the log above. Common causes:
  echo    - code not pushed to GitHub
  echo    - wrong SSH password / port 185
  echo    - local .env missing SUPABASE_DB_URL / JWT_SECRET / CREDENTIALS_ENCRYPTION_KEY / POSTGRES_PASSWORD
  echo    - Docker build error on server
) else (
  echo  OK. Open http://server.linooxel.com:3185/health
)

pause
endlocal & exit /b %ERR%
