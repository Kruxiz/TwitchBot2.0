@echo off
echo SpottyBotty Hosts File Updater
echo =================================
echo.
echo This will add "spottybotty.local" to your hosts file
echo This allows you to access the dashboard at http://spottybotty.local:8888
echo.

REM Check if running as admin
net session >nul 2>&1
if errorLevel 1 (
  echo ERROR: Administrator privileges required!
  echo.
  echo Please right-click this file and select "Run as Administrator"
  echo.
  pause
  exit /b 1
)

echo Running PowerShell script...
powershell -ExecutionPolicy Bypass -File "%~dp0update-hosts.ps1"

if errorLevel 1 (
  echo.
  echo Script failed - see error message above
  pause
  exit /b 1
)

echo.
echo Complete!
pause
