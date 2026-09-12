@echo off
chcp 65001 > nul
title WIN Wi-Fi Scanner Web

echo ========================================================
echo        WIN Wi-Fi Scanner Web - Launcher Windows
echo ========================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python no fue encontrado en el sistema.
    echo Por favor instala Python 3.8 o superior y agregalo al PATH.
    echo Descarga: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] Python detectado.
echo [*] Iniciando servidor web en http://localhost:5000...
echo [*] Abriendo navegador predeterminado...

start "" "http://localhost:5000"

python app.py

pause
