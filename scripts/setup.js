const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// 1. Create necessary directories
const dirs = ['data', 'backups'];
dirs.forEach(dir => {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath)) {
        console.log(`creating directory: ${dir}`);
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// 2. Setup .env from .env.example
const envPath = path.join(rootDir, '.env');
const examplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    console.log('creating .env from .env.example');
    fs.copyFileSync(examplePath, envPath);
} else if (!fs.existsSync(envPath)) {
    console.warn('⚠️  .env.example not found, skipping .env creation');
}

console.log('✅ Setup complete.');
