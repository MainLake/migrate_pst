const configDB = require('../db/config');
const restoreService = require('../services/restore');
const wsManager = require('../websocket/wsManager');

exports.restoreBackup = async (req, res) => {
    const jobState = wsManager.getJobState();
    if (jobState.isRunning) {
        return res.status(409).json({ error: 'A job is already in progress. Please wait.' });
    }

    try {
        const { backupId, targetConnectionId } = req.body;

        const progressCallback = (data) => {
            wsManager.broadcastProgress({ ...data, type: 'restore_progress' });
        };

        wsManager.broadcastProgress({ type: 'restore_started', backupId, targetConnectionId });

        const result = await restoreService.restore(
            backupId,
            targetConnectionId,
            progressCallback
        );

        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'RESTORE_BACKUP', { backupId, targetConnectionId }, req.ip);
        }

        wsManager.broadcastProgress({ type: 'restore_completed', ...result });
        res.json(result);
    } catch (error) {
        wsManager.broadcastProgress({ type: 'restore_failed', error: error.message });
        res.status(500).json({ error: error.message });
    }
};

exports.getRestoreHistory = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const restores = await configDB.getRestoreHistory(limit);
        res.json(restores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
