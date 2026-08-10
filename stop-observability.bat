@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo  Stopping native Loki + Promtail + Grafana...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\observability\stop-local.ps1"
pause
