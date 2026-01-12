Write-Host "Stopping and removing Docker containers..."
if (Get-Command "docker-compose" -ErrorAction SilentlyContinue) {
    docker-compose down -v --rmi all
} else {
    Write-Host "docker-compose not found, skipping Docker cleanup."
}

Write-Host "Removing node_modules..."
if (Test-Path "node_modules") {
    Remove-Item -Path "node_modules" -Recurse -Force
}

Write-Host "Uninstall complete."
