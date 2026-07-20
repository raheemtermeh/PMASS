@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   PMAS - starting API + Frontend
echo  ========================================
echo.

if not exist ".env" (
  echo  [ERROR] .env not found. Copy .env.example to .env and fill values.
  pause
  exit /b 1
)

where go >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Go is not in PATH.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] npm is not in PATH.
  pause
  exit /b 1
)

if not exist "pmas-live\node_modules\" (
  echo  [info] Installing frontend dependencies...
  pushd pmas-live
  call npm install
  if errorlevel 1 (
    echo  [ERROR] npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

echo  [1/2] Starting API on http://localhost:8080
start "PMAS API" /D "%~dp0" cmd /k "go run ./cmd/api"

timeout /t 2 /nobreak >nul

echo  [2/2] Starting Frontend on http://localhost:3000
start "PMAS Frontend" /D "%~dp0pmas-live" cmd /k "npm run dev"

timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo  Done. Two terminal windows are open (API + Frontend).
echo  Close those windows to stop the services.
echo.
pause
