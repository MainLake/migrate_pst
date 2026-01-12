#!/bin/bash

echo "Stopping and removing Docker containers..."
if command -v docker-compose &> /dev/null; then
    docker-compose down -v --rmi all
else
    echo "docker-compose not found, skipping Docker cleanup."
fi

echo "Removing node_modules..."
rm -rf node_modules

echo "Uninstall complete."
