@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if errorlevel 1 (set "PY=python") else (set "PY=py -3")

%PY% "%~dp0deploy\observability\server_logs.py" stop
pause
