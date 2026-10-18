@echo off
rem Starts Weekmenu on this computer for testing. Open http://localhost:3000 and sign in with: weekmenu
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet. Install the LTS version from https://nodejs.org and then start this file again.
  start "" https://nodejs.org
  pause
  exit /b
)
if "%APP_PASSWORD%"=="" set APP_PASSWORD=weekmenu
start "" http://localhost:3000
node server.js
pause
