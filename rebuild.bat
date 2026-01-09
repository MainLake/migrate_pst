@echo off
REM Script para reconstruir y reiniciar la aplicacion en Docker (Windows)
REM Usa este script cada vez que hagas cambios en el codigo

echo ========================================
echo   Reconstruyendo PG Migrate en Docker
echo ========================================
echo.

REM Detener contenedores
echo [STOP] Deteniendo contenedores...
docker-compose down

REM Reconstruir imagen
echo [BUILD] Reconstruyendo imagen con cambios...
docker-compose build --no-cache

REM Iniciar servicios
echo [START] Iniciando servicios...
docker-compose up -d

REM Esperar a que este listo
echo [WAIT] Esperando a que la aplicacion este lista...
timeout /t 5 /nobreak >nul

REM Verificar estado
echo.
echo [OK] Aplicacion reconstruida y reiniciada
echo.
echo Estado de los servicios:
docker-compose ps

echo.
echo ========================================
echo   Aplicacion disponible
echo ========================================
echo.
echo URL: http://localhost:3000
echo.
echo Comandos utiles:
echo   Ver logs:        docker-compose logs -f migrate-pst
echo   Detener:         docker-compose down
echo   Abrir shell:     docker-compose exec migrate-pst sh
echo.

pause
