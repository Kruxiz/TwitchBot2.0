@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
echo Running from: "%cd%"

set "NODE=%~dp0node\node.exe"
set "SCRIPT=%~dp0index.js"

echo NODE:   "%NODE%"
echo SCRIPT: "%SCRIPT%"

if not exist "%NODE%" (
  echo ERROR: Node executable not found at "%NODE%"
  pause
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo ERROR: index.js not found at "%SCRIPT%"
  pause
  exit /b 1
)

:START
echo.
echo =========================
echo Starting Spotipack... %date% %time%
echo =========================

"%NODE%" "%SCRIPT%"
set "EXITCODE=%ERRORLEVEL%"

echo Node exited with code: !EXITCODE! at %date% %time%

if "!EXITCODE!"=="10" (
  echo Restart requested by app. Restarting in 1 second...
  timeout /t 1 /nobreak >nul
  goto START
)

if "!EXITCODE!"=="0" (
  echo Clean exit (0). Restarting in 2 seconds...
  timeout /t 2 /nobreak >nul
  goto START
)

echo.
echo !!! Crash/Error exit code !EXITCODE! !!!
echo Press any key to restart, or close this window to stop.
pause >nul
goto START
