@echo off
echo Stopping and removing Docker containers...
docker-compose down -v --rmi all

echo Removing node_modules...
if exist node_modules (
    rmdir /s /q node_modules
)

echo Uninstall complete.
pause
