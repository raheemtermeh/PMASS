@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title PMAS API
echo Starting API — http://localhost:8080
echo Logs also append to logs\api.log
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "go run ./cmd/api 2>&1 | Tee-Object -FilePath 'logs\api.log' -Append"
echo.
echo API exited. Press any key to close.
pause >nul
