@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  ========================================
echo   PMAS — Grafana local + server logs
echo  ========================================
echo.

if not exist ".deploy.env" (
  echo  [ERROR] .deploy.env not found.
  echo         Copy .deploy.env.example to .deploy.env and set PMAS_SSH_PASS.
  pause
  exit /b 1
)

where py >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo  [ERROR] Python 3 required.
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
  %PY% -m pip install paramiko
)

%PY% "%~dp0deploy\observability\server_logs.py" start
set "ERR=%ERRORLEVEL%"

if "%ERR%"=="0" (
  timeout /t 2 /nobreak >nul
  start "" "http://127.0.0.1:3186"
)

echo.
if not "%ERR%"=="0" (
  echo  [ERROR] Failed. Try: stop-server-logs.bat then run again.
) else (
  echo  Stop anytime: stop-server-logs.bat
)
pause
endlocal & exit /b %ERR%


