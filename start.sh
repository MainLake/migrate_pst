#!/bin/bash

# PG Migrate - Autonomous PostgreSQL Backup & Restore Tool
# Quick start script

set -e

echo "🗄️  PG Migrate - PostgreSQL Backup & Restore Tool"
echo "=================================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "Please install Docker from: https://www.docker.com/get-started"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running!"
    echo "Please start Docker and try again."
    exit 1
fi

echo "✅ Docker is ready"
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "⚠️  docker-compose not found, using 'docker compose' instead"
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Stop existing containers if any
echo "🛑 Stopping existing containers..."
$COMPOSE_CMD down 2>/dev/null || true

# Build and start
echo "🔨 Building application..."
$COMPOSE_CMD build

echo "🚀 Starting services..."
$COMPOSE_CMD up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for health check
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Application is ready!"
        break
    fi
    echo "   Waiting... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Application failed to start properly"
    echo "Check logs with: $COMPOSE_CMD logs -f migrate-pst"
    exit 1
fi

echo ""
echo "=================================================="
echo "✨ PG Migrate is now running!"
echo ""
echo "📱 Web Interface: http://localhost:3000"
echo "📊 Example Source DB: localhost:5432 (postgres/postgres)"
echo "🎯 Example Target DB: localhost:5433 (postgres/postgres)"
echo ""
echo "📋 Useful commands:"
echo "   View logs:    $COMPOSE_CMD logs -f migrate-pst"
echo "   Stop:         $COMPOSE_CMD down"
echo "   Restart:      $COMPOSE_CMD restart"
echo "   Rebuild:      $COMPOSE_CMD up -d --build"
echo ""
echo "🌐 Opening browser..."
sleep 2

# Try to open browser
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v start &> /dev/null; then
    start http://localhost:3000
else
    echo "Please open http://localhost:3000 in your browser"
fi
