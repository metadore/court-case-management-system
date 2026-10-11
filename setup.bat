@echo off
REM Auto-elevate to Administrator, then run setup.ps1
net session >nul 2>&1
if errorlevel 1 (
    powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0setup.ps1\"' -Verb RunAs -WorkingDirectory '%~dp0'"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
