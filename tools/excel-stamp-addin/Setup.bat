@echo off
chcp 65001 >nul
title PDF Stamp Studio — Excel
cls
echo =========================================================================
echo  PDF Stamp Studio — Установка и Настройка в Microsoft Excel
echo  (ТОО «Ecology Expert» — Подписи и печать для протоколов)
echo =========================================================================
echo.
echo  [1] Быстрая установка кнопки в Microsoft Excel (1 клик, рекомендуемый)
echo  [2] Открыть окно настройки координат, подписей и печати
echo  [3] Удалить кнопку из Microsoft Excel
echo  [4] Выход
echo.
set /p opt="Выберите вариант [1-4] и нажмите Enter (по умолчанию 1): "
if "%opt%"=="" set opt=1
if "%opt%"=="1" goto install
if "%opt%"=="2" goto config
if "%opt%"=="3" goto uninstall
if "%opt%"=="4" exit /b
goto install

:install
call "%~dp0Установить_в_Excel.bat"
exit /b

:config
start "" "%~dp0Настройка_и_Установка_в_Excel.bat"
exit /b

:uninstall
call "%~dp0Удалить_из_Excel.bat"
exit /b
