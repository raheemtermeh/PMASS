@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo  Stopping local Grafana (server logs mode)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\observability\stop-grafana-only.ps1"
echo  Close the "PMAS Loki tunnel" SSH window manually if still open.
pause
