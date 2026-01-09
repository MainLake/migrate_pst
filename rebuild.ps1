# PowerShell script para reconstruir y reiniciar en Docker
# Usa este script cada vez que hagas cambios en el codigo

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Reconstruyendo PG Migrate en Docker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Detener contenedores
Write-Host "[STOP] Deteniendo contenedores..." -ForegroundColor Yellow
docker-compose down

# Reconstruir imagen
Write-Host "[BUILD] Reconstruyendo imagen con cambios..." -ForegroundColor Yellow
docker-compose build --no-cache

# Iniciar servicios
Write-Host "[START] Iniciando servicios..." -ForegroundColor Yellow
docker-compose up -d

# Esperar a que este listo
Write-Host "[WAIT] Esperando a que la aplicacion este lista..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verificar estado
Write-Host ""
Write-Host "[OK] Aplicacion reconstruida y reiniciada" -ForegroundColor Green
Write-Host ""
Write-Host "Estado de los servicios:" -ForegroundColor Yellow
docker-compose ps

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Aplicacion disponible" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "URL: " -NoNewline
Write-Host "http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Comandos utiles:" -ForegroundColor Yellow
Write-Host "  Ver logs:        docker-compose logs -f migrate-pst"
Write-Host "  Detener:         docker-compose down"
Write-Host "  Abrir shell:     docker-compose exec migrate-pst sh"
Write-Host ""

Read-Host "Press Enter to exit"
