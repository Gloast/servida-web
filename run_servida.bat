@echo off
title Servida — Fastpris Håndverkertjenester
echo ========================================================
echo   STARTER SERVIDA WEBNETTSIDE OG ADMINPORTAL
echo ========================================================
echo.
echo Starter lokal server pa http://localhost:8000...
echo.

start "" "http://localhost:8000"

"C:\Users\valso\AppData\Local\Programs\Python\Python311\python.exe" "%~dp0server.py"
pause
