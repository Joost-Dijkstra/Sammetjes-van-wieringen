@echo off
cd /d "%~dp0"
node scripts\open-workshop.cjs
if errorlevel 1 pause
