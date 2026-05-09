@echo off
title Vehicle FC Manager - Setup
color 0A
echo.
echo  ================================================
echo    VEHICLE FC MANAGER - FIRST TIME SETUP
echo  ================================================
echo.
echo  This will install all dependencies and build
echo  the app. Takes 2-3 minutes. Please wait...
echo.

echo  [1/3] Installing server packages...
call npm install
if %errorlevel% neq 0 ( echo  ERROR: npm install failed. Is Node.js installed? & pause & exit )

echo.
echo  [2/3] Installing client packages...
cd client
call npm install
if %errorlevel% neq 0 ( echo  ERROR: client npm install failed. & pause & exit )

echo.
echo  [3/3] Building app...
call npm run build
if %errorlevel% neq 0 ( echo  ERROR: build failed. & pause & exit )

cd ..
echo.
echo  ================================================
echo    SETUP COMPLETE!
echo.
echo    Run start.bat to launch the server
echo    Default login: admin / admin123
echo  ================================================
echo.
pause
