@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:4173/index.html"
python dev-server.py
pause
