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

# Function to stop containers
cleanup() {
    echo ""
    echo "🛑 Stopping containers..."
    $COMPOSE_CMD down
    echo "✅ Containers stopped. Goodbye!"
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Build and start
echo "🔨 Building application..."
$COMPOSE_CMD build

echo "🚀 Starting services..."
$COMPOSE_CMD up -d

echo ""
echo "⏳ Waiting for services to be healthy..."

# Wait for health check
MAX_RETRIES=30
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        HEALTHY=true
        echo "✅ Application is ready!"
        break
    fi
    echo "   Waiting... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Application failed to start properly."
    echo "Showing logs..."
    $COMPOSE_CMD logs --tail=50 migrate-pst
    cleanup
fi

echo ""
echo "=================================================="
echo "✨ PG Migrate is now running!"
echo ""
echo "📱 Web Interface: http://localhost:3000"
echo "📊 Example Source DB: localhost:5432 (postgres/postgres)"
echo "🎯 Example Target DB: localhost:5433 (postgres/postgres)"
echo ""
echo "⚠️  Press Ctrl+C to stop the server and containers"
echo "=================================================="
echo ""

# Open browser
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v start &> /dev/null; then
    start http://localhost:3000
fi

# Stream logs in foreground - this keeps the script running until Ctrl+C
# We use wait to allow the trap to work correctly with child processes
$COMPOSE_CMD logs -f &
wait $!

