@echo off
echo ========================================
echo   AssanPOS Network Printer Setup
echo   Building app with TCP socket support
echo ========================================
echo.

cd /d "%~dp0"

echo Step 1/3: Cleaning previous build...
call npx expo prebuild --clean

echo.
echo Step 2/3: Building Android app...
call npx expo run:android

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Open the app on your phone
echo 2. Go to Settings - Printer Settings
echo 3. Add Network Printer:
echo    - IP: 192.168.100.243
echo    - Port: 9100
echo    - Paper: 80mm
echo 4. Tap Test Print
echo 5. Watch your Bixolon printer print!
echo.
echo ========================================
pause
