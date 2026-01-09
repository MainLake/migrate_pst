require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Services
const configDB = require('./src/db/config');
const postgresService = require('./src/services/postgres');
const dockerService = require('./src/services/docker');
const backupService = require('./src/services/backup');
const restoreService = require('./src/services/restore');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for backup file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const backupDir = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        cb(null, backupDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const finalPath = path.join(process.env.BACKUP_DIR || path.join(__dirname, 'backups'), file.originalname);

        if (fs.existsSync(finalPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            cb(null, `${basename}_${timestamp}${ext}`);
        } else {
            cb(null, file.originalname);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.dump' || ext === '.sql') {
            cb(null, true);
        } else {
            cb(new Error('Only .dump and .sql files are allowed'));
        }
    }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Broadcast progress to all WebSocket clients
function broadcastProgress(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// ============= API Routes =============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== Connection Management =====

app.get('/api/connections', async (req, res) => {
    try {
        const connections = await configDB.getConnections();
        res.json(connections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/connections', async (req, res) => {
    try {
        const result = await configDB.addConnection(req.body);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/connections/:id', async (req, res) => {
    try {
        await configDB.updateConnection(req.params.id, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/connections/:id', async (req, res) => {
    try {
        await configDB.deleteConnection(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/connections/test', async (req, res) => {
    try {
        const result = await postgresService.testConnection(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/connections/:id/schemas', async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const schemas = await postgresService.getSchemas(connection);
        res.json(schemas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/connections/:id/schemas/:schema/tables', async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const tables = await postgresService.getTables(connection, req.params.schema);
        res.json(tables);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/connections/:id/schemas/:schema/tables/:table', async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const info = await postgresService.getTableInfo(
            connection,
            req.params.schema,
            req.params.table
        );
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Docker Management =====

app.get('/api/docker/test', async (req, res) => {
    try {
        const result = await dockerService.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/docker/containers', async (req, res) => {
    try {
        const containers = await dockerService.listPostgresContainers();
        res.json(containers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/docker/containers/:id', async (req, res) => {
    try {
        const info = await dockerService.getContainerInfo(req.params.id);
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Backup Configuration =====

app.get('/api/backup-configs', async (req, res) => {
    try {
        const configs = await configDB.getBackupConfigs();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/backup-configs', async (req, res) => {
    try {
        const result = await configDB.addBackupConfig(req.body);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/backup-configs/:id', async (req, res) => {
    try {
        await configDB.deleteBackupConfig(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Backup Operations =====

app.post('/api/backups', async (req, res) => {
    try {
        const progressCallback = (data) => {
            broadcastProgress({ type: 'backup_progress', ...data });
        };

        broadcastProgress({ type: 'backup_started', ...req.body });

        const result = await backupService.createBackup(req.body, progressCallback);

        broadcastProgress({ type: 'backup_completed', ...result });
        res.json(result);
    } catch (error) {
        broadcastProgress({ type: 'backup_failed', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/backups/from-config/:configId', async (req, res) => {
    try {
        const progressCallback = (data) => {
            broadcastProgress({ type: 'backup_progress', ...data });
        };

        broadcastProgress({ type: 'backup_started', configId: req.params.configId });

        const result = await backupService.createBackupFromConfig(
            req.params.configId,
            progressCallback
        );

        broadcastProgress({ type: 'backup_completed', ...result });
        res.json(result);
    } catch (error) {
        broadcastProgress({ type: 'backup_failed', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/backups', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const backups = await configDB.getBackupHistory(limit);
        res.json(backups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Import/Upload existing backup file
app.post('/api/backups/upload', upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { connectionId, schemaName } = req.body;
        const filePath = req.file.path;
        const fileSize = req.file.size;

        // Register in database
        const result = await configDB.addBackupHistory({
            connection_id: connectionId ? parseInt(connectionId) : null,
            schema_name: schemaName || 'imported',
            file_path: filePath,
            file_size: fileSize,
            status: 'completed'
        });

        res.json({
            success: true,
            message: 'Backup imported successfully',
            backup: {
                id: result.lastInsertRowid,
                file_path: filePath,
                file_size: fileSize,
                schema_name: schemaName || 'imported'
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        // Clean up file if registration failed
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/backups/:id', (req, res) => {
    try {
        const result = backupService.deleteBackup(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Restore Operations =====

app.post('/api/restore', async (req, res) => {
    try {
        const { backupId, targetConnectionId } = req.body;

        const progressCallback = (data) => {
            broadcastProgress({ type: 'restore_progress', ...data });
        };

        broadcastProgress({ type: 'restore_started', backupId, targetConnectionId });

        const result = await restoreService.restore(
            backupId,
            targetConnectionId,
            progressCallback
        );

        broadcastProgress({ type: 'restore_completed', ...result });
        res.json(result);
    } catch (error) {
        broadcastProgress({ type: 'restore_failed', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/restores', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const restores = await configDB.getRestoreHistory(limit);
        res.json(restores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
