@echo off
setlocal
cd /d "%~dp0"

start "Sammeltjes Dev Server" cmd /k "cd /d ""%~dp0"" && python dev-server.py"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/admin.html"

endlocal
