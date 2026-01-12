const cron = require('node-cron');
const configDB = require('../db/config');
const backupService = require('./backup');

class SchedulerService {
    constructor() {
        this.tasks = new Map();
        this.init();
    }

    async init() {
        console.log('📅 Initializing Scheduler Service...');
        await this.loadScheduledTasks();
    }

    async loadScheduledTasks() {
        // Stop existing tasks
        this.tasks.forEach(task => task.stop());
        this.tasks.clear();

        const configs = await configDB.getBackupConfigs();
        const scheduledConfigs = configs.filter(c => c.cron_schedule);

        console.log(`📅 Found ${scheduledConfigs.length} scheduled backup tasks.`);

        scheduledConfigs.forEach(config => {
            this.scheduleTask(config);
        });
    }

    scheduleTask(config) {
        if (!cron.validate(config.cron_schedule)) {
            console.error(`❌ Invalid cron schedule for config '${config.name}': ${config.cron_schedule}`);
            return;
        }

        console.log(`📅 Scheduling '${config.name}' with schedule: ${config.cron_schedule}`);

        const task = cron.schedule(config.cron_schedule, async () => {
            console.log(`⏰ Starting scheduled backup: ${config.name}`);

            try {
                // Run backup
                // We use a dummy progress callback for now, or we could log to a specific file
                const result = await backupService.createBackupFromConfig(config.id, (data) => {
                    // console.log(`[Task: ${config.name}] ${data.type}: ${data.message || ''}`);
                });

                if (result.success) {
                    console.log(`✅ Scheduled backup '${config.name}' completed: ${result.file_path}`);

                    // Send notification
                    if (config.webhook_url) {
                        this.sendNotification(config.webhook_url, {
                            event: 'backup_success',
                            task: config.name,
                            file: result.file_path,
                            size: result.file_size,
                            timestamp: new Date().toISOString()
                        });
                    }

                    // Handle retention
                    if (config.retention_count && config.retention_count > 0) {
                        await this.enforceRetentionPolicy(config.id, config.retention_count);
                    }
                } else {
                    console.error(`❌ Scheduled backup '${config.name}' failed.`);

                    if (config.webhook_url) {
                        this.sendNotification(config.webhook_url, {
                            event: 'backup_failed',
                            task: config.name,
                            error: 'Backup failed (check server logs)',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            } catch (error) {
                console.error(`❌ Error in scheduled backup '${config.name}':`, error.message);
                if (config.webhook_url) {
                    this.sendNotification(config.webhook_url, {
                        event: 'backup_error',
                        task: config.name,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });

        this.tasks.set(config.id, task);
    }

    async sendNotification(url, data) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error(`⚠️ Failed to send webhook notification: ${error.message}`);
        }
    }

    async enforceRetentionPolicy(configId, maxCount) {
        try {
            // Get all backups for this config, ordered by date desc
            const configBackups = await configDB.getBackupHistoryByConfigId(configId);
            // const configBackups = history.filter(h => h.config_id === configId && h.status === 'completed'); // Filtered by SQL now

            if (configBackups.length > maxCount) {
                const backupsToDelete = configBackups.slice(maxCount);
                console.log(`🧹 Retention Policy: Deleting ${backupsToDelete.length} old backups for config ${configId}...`);

                for (const backup of backupsToDelete) {
                    try {
                        await backupService.deleteBackup(backup.id);
                        console.log(`   - Deleted backup ${backup.id} (${backup.file_path})`);
                    } catch (err) {
                        console.error(`   - Failed to delete backup ${backup.id}: ${err.message}`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error enforcing retention policy: ${error.message}`);
        }
    }

    // Refresh tasks (call this when a config is added/updated/deleted)
    async reload() {
        await this.loadScheduledTasks();
    }
}

module.exports = new SchedulerService();
