@echo off
chcp 65001 >nul
title PDF Stamp Studio — Настройка и Установка в Excel
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0PdfStampConfigurator.ps1"
exit /b
