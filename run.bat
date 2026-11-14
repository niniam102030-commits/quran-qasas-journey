@echo off
title Quran Qasas Journey - واژگان سخت سوره قصص

echo =========================================================
echo   Quran Qasas Journey - واژگان سخت و تله‌های سوره قصص
echo =========================================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] Installing dependencies, please wait...
    call npm install
)

echo [INFO] Starting Vite dev server and opening browser...
echo.

call npm run dev -- --host 127.0.0.1 --open

pause
