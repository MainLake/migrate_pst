# PowerShell script para iniciar PG Migrate
# Quick start script for Windows PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PG Migrate - PostgreSQL Backup Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://www.docker.com/get-started"
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] Docker is ready" -ForegroundColor Green
Write-Host ""

# Determine docker-compose command
$composeCmd = "docker-compose"
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    $composeCmd = "docker compose"
}

# Stop existing containers
Write-Host "[STOP] Stopping existing containers..." -ForegroundColor Yellow
& $composeCmd down 2>$null

# Build and start
Write-Host "[BUILD] Building application..." -ForegroundColor Yellow
& $composeCmd build

Write-Host "[START] Starting services..." -ForegroundColor Yellow
& $composeCmd up -d

Write-Host ""
Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PG Migrate is now running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Web Interface: " -NoNewline
Write-Host "http://localhost:3000" -ForegroundColor Cyan
Write-Host "Example Source DB: localhost:5432 (postgres/postgres)"
Write-Host "Example Target DB: localhost:5433 (postgres/postgres)"
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  View logs:    $composeCmd logs -f migrate-pst"
Write-Host "  Stop:         $composeCmd down"
Write-Host "  Restart:      $composeCmd restart"
Write-Host "  Rebuild:      $composeCmd up -d --build"
Write-Host ""

# Open browser
Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

Read-Host "Press Enter to exit"
