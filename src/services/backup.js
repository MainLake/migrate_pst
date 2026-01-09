const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const configDB = require('../db/config');

class BackupService {
    constructor() {
        this.backupDir = process.env.BACKUP_DIR || './backups';
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    async createBackup(options, progressCallback) {
        const { connectionId, schema, excludedTables = [], excludedDataTables = [], rowFilters = {}, format = 'custom', configId } = options;

        // Get connection config
        const connection = await configDB.getConnection(connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }

        // Generate backup filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_${connection.database}_${schema}_${timestamp}.${format === 'custom' ? 'dump' : 'sql'}`;
        const filePath = path.join(this.backupDir, filename);

        // Build pg_dump command with safe property access
        const port = connection.port || 5432;
        const host = connection.host || 'localhost';
        const username = connection.username || 'postgres';
        const database = connection.database || '';

        const args = [
            '-h', host,
            '-p', port.toString(),
            '-U', username,
            '-d', database,
            '-n', schema, // Specific schema
            '-F', format === 'custom' ? 'c' : 'p', // Format: custom or plain
            '-f', filePath,
            '--verbose'
        ];

        // Add excluded tables (complete exclusion - structure and data)
        excludedTables.forEach(table => {
            args.push('--exclude-table', `${schema}.${table}`);
        });

        // Add excluded data tables (only exclude data, keep structure)
        excludedDataTables.forEach(table => {
            args.push('--exclude-table-data', `${schema}.${table}`);
        });

        // Handle row filters (this is more complex - we need to use --exclude-table-data and then insert filtered data)
        if (Object.keys(rowFilters).length > 0) {
            // For now, we'll add a note that row filtering requires a two-step process
            // This is a advanced feature that we can implement later
            progressCallback && progressCallback({
                type: 'warning',
                message: 'Row filters will be applied in a future version. Creating full table backup.'
            });
        }

        // Send command details to frontend
        const commandString = `pg_dump ${args.join(' ')}`;
        progressCallback && progressCallback({
            type: 'backup_command',
            command: commandString
        });

        return new Promise((resolve, reject) => {
            const env = {
                ...process.env,
                PGPASSWORD: connection.password || ''
            };

            const pgDump = spawn('pg_dump', args, { env });

            let errorOutput = '';

            pgDump.stderr.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;

                // Send progress updates
                if (progressCallback) {
                    progressCallback({ type: 'progress', message: message.trim() });
                }
            });

            pgDump.on('close', async (code) => {
                if (code === 0) {
                    // Get file size
                    const stats = fs.statSync(filePath);

                    // Save to history
                    try {
                        const result = configDB.addBackupHistory({
                            config_id: configId || null,
                            connection_id: connectionId,
                            schema_name: schema,
                            file_path: filePath,
                            file_size: stats.size,
                            status: 'completed'
                        });

                        resolve({
                            success: true,
                            backup_id: result.lastInsertRowid,
                            file_path: filePath,
                            file_size: stats.size,
                            schema: schema
                        });
                    } catch (dbError) {
                        // File created successfully but failed to save to history
                        resolve({
                            success: true,
                            file_path: filePath,
                            file_size: stats.size,
                            schema: schema,
                            warning: 'Backup created but failed to save to history'
                        });
                    }
                } else {
                    // Save failed backup to history
                    try {
                        configDB.addBackupHistory({
                            connection_id: connectionId,
                            schema_name: schema,
                            file_path: filePath,
                            status: 'failed',
                            error_message: errorOutput
                        });
                    } catch (dbError) {
                        // Ignore history save errors for failed backups
                    }

                    reject(new Error(`pg_dump failed with code ${code}: ${errorOutput}`));
                }
            });

            pgDump.on('error', (error) => {
                reject(new Error(`Failed to start pg_dump: ${error.message}`));
            });
        });
    }

    async createBackupFromConfig(configId, progressCallback) {
        const config = configDB.getBackupConfig(configId);
        if (!config) {
            throw new Error('Backup configuration not found');
        }

        return this.createBackup({
            connectionId: config.connection_id,
            schema: config.schema_name,
            excludedTables: config.excluded_tables,
            rowFilters: config.row_filters,
            format: config.format,
            configId: configId
        }, progressCallback);
    }

    getBackupFilePath(backupId) {
        const backup = configDB.getBackup(backupId);
        if (!backup) {
            throw new Error('Backup not found');
        }
        return backup.file_path;
    }

    deleteBackup(backupId) {
        const backup = configDB.getBackup(backupId);
        if (!backup) {
            throw new Error('Backup not found');
        }

        // Delete file
        if (fs.existsSync(backup.file_path)) {
            fs.unlinkSync(backup.file_path);
        }

        // Note: The database record will be kept for history
        return { success: true };
    }
}

module.exports = new BackupService();
