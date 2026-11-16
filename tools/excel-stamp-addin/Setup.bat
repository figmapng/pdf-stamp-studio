@echo off
chcp 65001 >nul
title PDF Stamp Studio — Баптау және Орнату

echo ========================================================
echo   PDF Stamp Studio — Excel Add-in Орнатқышы
echo ========================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Python арқылы графикалық баптау терезесі ашылуда...
    python "%~dp0PdfStampConfigurator.py"
    goto end
)

echo Python табылмады. PowerShell арқылы автоматты орнату жүруде...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause

:end
