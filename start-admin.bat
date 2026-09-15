@echo off
setlocal
cd /d "%~dp0"

node scripts\open-workshop.cjs --admin
if errorlevel 1 pause

endlocal
