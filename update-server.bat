@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  PMAS server update
echo  ==================
echo.

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
  %PY% -m pip install paramiko
  if errorlevel 1 (
    echo  [ERROR] Could not install paramiko.
    pause
    exit /b 1
  )
)

REM Optional: put password in .deploy.env as PMAS_SSH_PASS=...
REM so you are not asked every time.
%PY% "%~dp0deploy\remote_update.py"
set "ERR=%ERRORLEVEL%"
endlocal & exit /b %ERR%
