const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const configDB = require('../db/config');
const dockerService = require('./docker');

class RestoreService {
    async restoreToLocal(backupId, targetConnectionId, progressCallback) {
        const backup = await configDB.getBackup(backupId);
        if (!backup) {
            throw new Error('Backup not found');
        }

        if (!fs.existsSync(backup.file_path)) {
            throw new Error('Backup file not found');
        }

        const connection = await configDB.getConnection(targetConnectionId);
        if (!connection) {
            throw new Error('Target connection not found');
        }

        // Determine format from file extension
        const format = backup.file_path.endsWith('.sql') ? 'p' : 'c';

        // Build pg_restore or psql command
        const args = format === 'c'
            ? [
                '-h', connection.host,
                '-p', connection.port.toString(),
                '-U', connection.username,
                '-d', connection.database,
                '--verbose',
                '--clean', // Drop objects before recreating
                '--if-exists', // Don't error if objects don't exist
                backup.file_path
            ]
            : [
                '-h', connection.host,
                '-p', connection.port.toString(),
                '-U', connection.username,
                '-d', connection.database,
                '-f', backup.file_path
            ];

        const command = format === 'c' ? 'pg_restore' : 'psql';

        return new Promise((resolve, reject) => {
            const env = {
                ...process.env,
                PGPASSWORD: connection.password || ''
            };

            const restore = spawn(command, args, { env });

            let errorOutput = '';
            let stdOutput = '';

            restore.stdout.on('data', (data) => {
                const message = data.toString();
                stdOutput += message;
                progressCallback && progressCallback({ type: 'progress', message: message.trim() });
            });

            restore.stderr.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                progressCallback && progressCallback({ type: 'progress', message: message.trim() });
            });

            restore.on('close', async (code) => {
                if (code === 0) {
                    // Save to history
                    try {
                        configDB.addRestoreHistory({
                            backup_id: backupId,
                            target_connection_id: targetConnectionId,
                            status: 'completed'
                        });
                    } catch (dbError) {
                        // Ignore history save errors
                    }

                    resolve({
                        success: true,
                        message: 'Restore completed successfully'
                    });
                } else {
                    // Save failed restore to history
                    try {
                        configDB.addRestoreHistory({
                            backup_id: backupId,
                            target_connection_id: targetConnectionId,
                            status: 'failed',
                            error_message: errorOutput
                        });
                    } catch (dbError) {
                        // Ignore history save errors
                    }

                    reject(new Error(`${command} failed with code ${code}: ${errorOutput}`));
                }
            });

            restore.on('error', (error) => {
                reject(new Error(`Failed to start ${command}: ${error.message}`));
            });
        });
    }

    async restoreToDocker(backupId, targetConnectionId, progressCallback) {
        const backup = await configDB.getBackup(backupId);
        if (!backup) {
            throw new Error('Backup not found');
        }

        if (!fs.existsSync(backup.file_path)) {
            throw new Error('Backup file not found');
        }

        const connection = await configDB.getConnection(targetConnectionId);
        if (!connection) {
            throw new Error('Target connection not found');
        }

        if (!connection.is_docker) {
            throw new Error('Target connection is not a Docker container');
        }

        const containerId = connection.docker_container_id;
        if (!containerId) {
            throw new Error('Docker container ID not specified');
        }

        progressCallback && progressCallback({
            type: 'progress',
            message: 'Copying backup file to container...'
        });

        // Copy backup file to container
        const containerBackupPath = `/tmp/${path.basename(backup.file_path)}`;
        await dockerService.copyFileToContainer(
            containerId,
            backup.file_path,
            containerBackupPath
        );

        progressCallback && progressCallback({
            type: 'progress',
            message: 'File copied. Starting restore...'
        });

        // Determine format and build restore command
        const format = backup.file_path.endsWith('.sql') ? 'sql' : 'custom';

        const restoreCmd = format === 'custom'
            ? [
                'pg_restore',
                '-U', connection.username,
                '-d', connection.database,
                '--verbose',
                '--clean',
                '--if-exists',
                containerBackupPath
            ]
            : [
                'psql',
                '-U', connection.username,
                '-d', connection.database,
                '-f', containerBackupPath
            ];

        try {
            // Execute restore command in container
            const result = await dockerService.execCommand(containerId, restoreCmd);

            progressCallback && progressCallback({
                type: 'progress',
                message: result.output
            });

            // Clean up backup file in container
            await dockerService.execCommand(containerId, ['rm', containerBackupPath]);

            // Save to history
            try {
                configDB.addRestoreHistory({
                    backup_id: backupId,
                    target_connection_id: targetConnectionId,
                    status: 'completed'
                });
            } catch (dbError) {
                // Ignore history save errors
            }

            return {
                success: true,
                message: 'Restore to Docker container completed successfully'
            };
        } catch (error) {
            // Save failed restore to history
            try {
                configDB.addRestoreHistory({
                    backup_id: backupId,
                    target_connection_id: targetConnectionId,
                    status: 'failed',
                    error_message: error.message
                });
            } catch (dbError) {
                // Ignore history save errors
            }

            throw error;
        }
    }

    async restore(backupId, targetConnectionId, progressCallback) {
        const connection = await configDB.getConnection(targetConnectionId);
        if (!connection) {
            throw new Error('Target connection not found');
        }

        if (connection.is_docker) {
            return this.restoreToDocker(backupId, targetConnectionId, progressCallback);
        } else {
            return this.restoreToLocal(backupId, targetConnectionId, progressCallback);
        }
    }
}

module.exports = new RestoreService();
