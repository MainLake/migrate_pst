const http = require('http');
const app = require('./src/app');
const wsManager = require('./src/websocket/wsManager');
const configDB = require('./src/db/config');
require('./src/services/scheduler'); // Initialize Scheduler

const server = http.createServer(app);

// Initialize WebSocket
wsManager.init(server);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 PostgreSQL Backup & Restore Tool running on http://localhost:${PORT}`);
    console.log(`📊 WebSocket server running on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => {
        configDB.close();
        console.log('Server closed');
        process.exit(0);
    });
});