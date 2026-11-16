@echo off
:: Windows Native Launcher (Ешқандай бағдарлама/Python орнатуды талап етпейді)
start /b "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0PdfStampConfigurator.ps1"
exit /b
