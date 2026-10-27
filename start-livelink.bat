@echo off
title LiveLink Studio
cd /d "%~dp0"
echo ===================================================
echo   LiveLink Ultra-Low Latency Multi-Camera Studio
echo ===================================================
echo Starting LiveLink server...
node server/index.js
pause
