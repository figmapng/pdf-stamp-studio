@echo off
chcp 65001 >nul
title Удаление надстройки PDF Stamp Studio из Microsoft Excel
cls
echo =========================================================================
echo  PDF Stamp Studio — Удаление надстройки из Microsoft Excel
echo =========================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall

echo.
pause
