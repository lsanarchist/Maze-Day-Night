@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 18 or newer first.
  pause
  exit /b 1
)
start "" http://localhost:5173
node tools/serve.mjs
pause
