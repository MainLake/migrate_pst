#!/bin/bash

# Script para reconstruir y reiniciar la aplicación en Docker
# Usa este script cada vez que hagas cambios en el código

set -e

echo "🔄 Reconstruyendo y reiniciando PG Migrate en Docker..."
echo ""

# Detener contenedores
echo "🛑 Deteniendo contenedores..."
docker-compose down

# Reconstruir imagen
echo "🔨 Reconstruyendo imagen con cambios..."
docker-compose build --no-cache

# Iniciar servicios
echo "🚀 Iniciando servicios..."
docker-compose up -d

# Esperar a que esté listo
echo "⏳ Esperando a que la aplicación esté lista..."
sleep 5

# Verificar estado
echo ""
echo "✅ Aplicación reconstruida y reiniciada"
echo ""
echo "📊 Estado de los servicios:"
docker-compose ps

echo ""
echo "📱 Aplicación disponible en: http://localhost:3000"
echo ""
echo "💡 Comandos útiles:"
echo "   Ver logs:        docker-compose logs -f migrate-pst"
echo "   Detener:         docker-compose down"
echo "   Abrir shell:     docker-compose exec migrate-pst sh"
echo ""
