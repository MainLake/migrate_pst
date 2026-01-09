@echo off
REM Script para iniciar PG Migrate en Windows
REM Quick start script for Windows

echo ========================================
echo   PG Migrate - PostgreSQL Backup Tool
echo ========================================
echo.

REM Check if Docker is installed
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not installed!
    echo Please install Docker Desktop from: https://www.docker.com/get-started
    pause
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not running!
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo [OK] Docker is ready
echo.

REM Check if docker-compose is available
where docker-compose >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set COMPOSE_CMD=docker-compose
) else (
    set COMPOSE_CMD=docker compose
)

REM Stop existing containers
echo [STOP] Stopping existing containers...
%COMPOSE_CMD% down 2>nul

REM Build and start
echo [BUILD] Building application...
%COMPOSE_CMD% build

echo [START] Starting services...
%COMPOSE_CMD% up -d

echo.
echo Waiting for services to be healthy...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   PG Migrate is now running!
echo ========================================
echo.
echo Web Interface: http://localhost:3000
echo Example Source DB: localhost:5432 (postgres/postgres)
echo Example Target DB: localhost:5433 (postgres/postgres)
echo.
echo Useful commands:
echo   View logs:    %COMPOSE_CMD% logs -f migrate-pst
echo   Stop:         %COMPOSE_CMD% down
echo   Restart:      %COMPOSE_CMD% restart
echo   Rebuild:      %COMPOSE_CMD% up -d --build
echo.
echo Opening browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000

pause
