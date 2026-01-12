require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authController = require('./controllers/auth.controller');

// Routes
const authRoutes = require('./routes/auth.routes');
const connectionsRoutes = require('./routes/connections.routes');
const dockerRoutes = require('./routes/docker.routes');
const backupsRoutes = require('./routes/backups.routes');
const backupConfigsRoutes = require('./routes/backupConfigs.routes');
const restoreRoutes = require('./routes/restore.routes');
const healthRoutes = require('./routes/health.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Admin User (Server Mode)
authController.initAdmin();

// Routes Mounting
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/backup-configs', backupConfigsRoutes);
app.use('/api', restoreRoutes); // Mounts /restore and /restores
app.use('/api/health', healthRoutes);

module.exports = app;
