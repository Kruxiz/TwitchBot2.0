@echo off
cd > %TEMP%\botpath.txt
set /p BOT_PATH=<%TEMP%\botpath.txt
echo ====================================
echo Spotty Botty - Uninstall Service
echo ====================================
echo.

net session >nul 2>&1
if errorLevel 1 (
  echo ERROR: Administrator privileges required
  echo Please run as Administrator
  pause
  exit /b 1
)

sc query SpottyBotty >nul 2>&1
if errorLevel 1 (
  echo Service "SpottyBotty" is not installed
  echo Nothing to uninstall
  pause
  exit /b 0
)

echo WARNING: This will completely remove SpottyBotty service
echo.
set /p CONFIRM="Type YES to confirm: "
if /i not "%CONFIRM%"=="YES" (
  echo Uninstall cancelled
  pause
  exit /b 0
)

echo.
echo Stopping service...
nssm stop SpottyBotty >nul 2>&1
timeout /t 2 >nul

echo.
echo Removing service...
nssm remove SpottyBotty confirm

if errorLevel 1 (
  echo Error removing service
  echo Try: sc delete SpottyBotty
  pause
  exit /b 1
)

echo.
echo ====================================
echo SUCCESS: Service removed
echo ====================================
echo.
pause
