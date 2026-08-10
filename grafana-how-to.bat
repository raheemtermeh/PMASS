@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   PMAS Grafana (server logs on your PC)
echo  ========================================
echo.
echo  Step A — one time: deploy Loki on server
echo           update-server.bat
echo.
echo  Step B — view logs:
echo           view-server-logs.bat
echo.
echo  Login Grafana: admin / admin
echo  URL: http://127.0.0.1:3186
echo  Dashboard: Dashboards -^> PMAS -^> PMAS Logs
echo.
echo  Stop: stop-server-logs.bat
echo.
echo  Full guide: deploy\observability\README.md
echo.
pause
