@echo off
cd /d "%~dp0"
title Engineer Islam Fouda - Work Management System Launcher
echo ========================================================
echo Engineer Islam Fouda - Professional Work Management System
echo Powering a Better Tomorrow - Version 16.48
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launcher.ps1"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Launcher failed to start. Press any key to exit...
  pause >nul
)
