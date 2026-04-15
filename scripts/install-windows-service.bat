@echo off
cd > %TEMP%\botpath.txt
set /p BOT_PATH=<%TEMP%\botpath.txt
echo ====================================
echo Spotty Botty Windows Service Installer
echo ====================================
echo.

net session >nul 2>&1
if errorLevel 1 (
  echo ERROR: Administrator privileges required
  echo Please right-click and select "Run as Administrator"
  pause
  exit /b 1
)

where node >nul 2>&1
if errorLevel 1 (
  echo ERROR: Node.js not found. Please install from nodejs.org
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('where node') do set NODE_PATH=%%i
echo Found Node.js: %NODE_PATH%
echo.

if not exist "C:\Windows\System32\nssm.exe" goto install_nssm
echo Found NSSM at C:\Windows\System32\nssm.exe
goto service_setup

:install_nssm
echo.
echo NSSM is required but not found in C:\Windows\System32\
echo.
echo You have two options:
echo.
echo 1) Run PowerShell command (simplest):
echo    powershell -ExecutionPolicy Bypass -File "%BOT_PATH%\scripts\nssm-download.ps1"
echo.
echo 2) Manual install:
echo    Download: https://nssm.cc/release/nssm-2.24.zip
echo    Extract nssm.exe to: C:\Windows\System32\
echo.
echo After installing NSSM, run this script again
pause
exit /b 1

:service_setup
echo.
echo Setting up Windows Service...
echo.

sc query SpottyBotty >nul 2>&1
if not errorLevel 1 nssm remove SpottyBotty confirm
timeout /t 2 >nul

set SERVICE_NAME=SpottyBotty
nssm install %SERVICE_NAME% "%NODE_PATH%"
nssm set %SERVICE_NAME% AppDirectory "%BOT_PATH%"
nssm set %SERVICE_NAME% AppParameters "index.js"
nssm set %SERVICE_NAME% DisplayName "Spotty Botty Music Bot"
nssm set %SERVICE_NAME% Description "Always-on dashboard at http://localhost:8888/dashboard"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppExit Default Restart
nssm set %SERVICE_NAME% AppRestartDelay 10000

if not exist "%BOT_PATH%\logs" mkdir "%BOT_PATH%\logs"
nssm set %SERVICE_NAME% AppStdout "%BOT_PATH%\logs\service.log"
nssm set %SERVICE_NAME% AppStderr "%BOT_PATH%\logs\service-error.log"

echo.
echo Starting service...
nssm start %SERVICE_NAME%
if errorLevel 1 (
  echo ERROR: Failed to start service
  echo Check logs at: %BOT_PATH%\logs\
  pause
  exit /b 1
)

echo.
echo ====================================
echo SUCCESS
echo ====================================
echo.
echo Service installed and started
echo Dashboard: http://localhost:8888/dashboard
echo.
echo To uninstall: .\scripts\uninstall-windows-service.bat
echo.
pause
