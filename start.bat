@echo off
title Vehicle FC Manager
color 0B
echo.
echo  Starting Vehicle FC Manager...
echo  Keep this window open while the app is running.
echo  Press Ctrl+C to stop.
echo.

rem Kill any existing process on port 3001
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)

node --no-warnings server/index.js
pause
