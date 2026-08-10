@echo off
chcp 65001 >nul
cd /d "%~dp0..\pmas-live"
title PMAS Frontend
echo Starting Frontend — http://localhost:3000
echo Logs also append to ..\logs\web.log
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "npm run dev 2>&1 | Tee-Object -FilePath '..\logs\web.log' -Append"
echo.
echo Frontend exited. Press any key to close.
pause >nul
