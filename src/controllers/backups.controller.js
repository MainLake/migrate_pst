const configDB = require('../db/config');
const backupService = require('../services/backup');
const schedulerService = require('../services/scheduler');
const wsManager = require('../websocket/wsManager');
const fs = require('fs');

exports.getBackupConfigs = async (req, res) => {
    try {
        const configs = await configDB.getBackupConfigs();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.addBackupConfig = async (req, res) => {
    try {
        const result = await configDB.addBackupConfig(req.body);
        await schedulerService.reload();
        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'CREATE_CONFIG', { name: req.body.name }, req.ip);
        }
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteBackupConfig = async (req, res) => {
    try {
        await configDB.deleteBackupConfig(req.params.id);
        await schedulerService.reload();
        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'DELETE_CONFIG', { id: req.params.id }, req.ip);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createBackup = async (req, res) => {
    const jobState = wsManager.getJobState();
    if (jobState.isRunning) {
        return res.status(409).json({ error: 'A job is already in progress. Please wait.' });
    }

    try {
        const progressCallback = (data) => {
            wsManager.broadcastProgress({ type: 'backup_progress', ...data });
        };

        wsManager.broadcastProgress({ type: 'backup_started', ...req.body });

        const result = await backupService.createBackup(req.body, progressCallback);

        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'RUN_BACKUP', { file: result.file_path }, req.ip);
        }

        wsManager.broadcastProgress({ type: 'backup_completed', ...result });
        res.json(result);
    } catch (error) {
        wsManager.broadcastProgress({ type: 'backup_failed', error: error.message });
        res.status(500).json({ error: error.message });
    }
};

exports.createBackupFromConfig = async (req, res) => {
    const jobState = wsManager.getJobState();
    if (jobState.isRunning) {
        return res.status(409).json({ error: 'A job is already in progress. Please wait.' });
    }

    try {
        const progressCallback = (data) => {
            wsManager.broadcastProgress({ type: 'backup_progress', ...data });
        };

        wsManager.broadcastProgress({ type: 'backup_started', configId: req.params.configId });

        const result = await backupService.createBackupFromConfig(
            req.params.configId,
            progressCallback
        );

        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'RUN_BACKUP_CONFIG', { configId: req.params.configId, file: result.file_path }, req.ip);
        }

        wsManager.broadcastProgress({ type: 'backup_completed', ...result });
        res.json(result);
    } catch (error) {
        wsManager.broadcastProgress({ type: 'backup_failed', error: error.message });
        res.status(500).json({ error: error.message });
    }
};

exports.getBackupHistory = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const backups = await configDB.getBackupHistory(limit);
        res.json(backups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.downloadBackup = async (req, res) => {
    try {
        const filePath = await backupService.getBackupFilePath(req.params.id);
        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'DOWNLOAD_BACKUP', { id: req.params.id }, req.ip);
        }
        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({ error: 'Backup file not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.uploadBackup = async (req, res) => {
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

        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'UPLOAD_BACKUP', { file: filePath }, req.ip);
        }

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
};

exports.deleteBackup = async (req, res) => {
    try {
        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'DELETE_BACKUP', { id: req.params.id }, req.ip);
        }
        const result = await backupService.deleteBackup(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
