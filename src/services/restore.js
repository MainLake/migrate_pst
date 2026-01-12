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

            const parseProgress = (data) => {
                const message = data.toString();
                const lines = message.split('\n');
                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return;

                    let friendlyMessage = trimmedLine;
                    const type = 'progress';

                    // Parse common pg_restore/psql verbose messages
                    if (trimmedLine.startsWith('pg_restore: creating TABLE')) {
                        const table = trimmedLine.split('TABLE')[1].trim();
                        friendlyMessage = `🔨 Creating table: ${table}`;
                    } else if (trimmedLine.startsWith('pg_restore: restoring data for table')) {
                        const table = trimmedLine.split('table')[1].trim();
                        friendlyMessage = `📦 Restoring data for table: ${table}`;
                    } else if (trimmedLine.startsWith('pg_restore: creating INDEX')) {
                        friendlyMessage = `🔎 Creating index`;
                    } else if (trimmedLine.startsWith('pg_restore: creating CONSTRAINT')) {
                        friendlyMessage = `🔒 Creating constraint`;
                    } else if (trimmedLine.startsWith('pg_restore: processing data for table')) {
                        const table = trimmedLine.split('table')[1].trim();
                        friendlyMessage = `📦 Processing data: ${table}`;
                    }

                    progressCallback && progressCallback({
                        type: type,
                        message: friendlyMessage,
                        original: trimmedLine
                    });
                });
                return message;
            };

            restore.stdout.on('data', (data) => {
                stdOutput += parseProgress(data);
            });

            restore.stderr.on('data', (data) => {
                errorOutput += parseProgress(data);
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

        let containerId = connection.docker_container_id;

        // Self-healing: Check if container exists
        const containerExists = await dockerService.verifyContainer(containerId);

        if (!containerExists) {
            console.log(`Container ${containerId} not found. Attempting to resolve by name...`);

            // Try to find by name if we have one
            const containerName = connection.docker_container_name || connection.name; // Fallback to connection name if specific container name is missing
            const newContainerId = await dockerService.findContainerByName(containerName);

            if (newContainerId) {
                console.log(`Resolved container ${containerName} to ID ${newContainerId}. Updating connection...`);

                // Update database with new ID
                await configDB.updateConnection(targetConnectionId, {
                    ...connection,
                    docker_container_id: newContainerId,
                    docker_container_name: containerName // Ensure name is saved for future
                });

                containerId = newContainerId;

                progressCallback && progressCallback({
                    type: 'progress',
                    message: `⚠️  Container ID changed. Updated connection to use new container: ${containerName}`
                });
            } else {
                throw new Error(`Docker container not found. ID: ${containerId}, Name: ${containerName}. Please check if the container is running.`);
            }
        }

        if (!containerId) {
            throw new Error('Docker container ID not specified and could not be resolved');
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
            const result = await dockerService.execCommand(containerId, restoreCmd, (data) => {
                const message = data.toString();
                const lines = message.split('\n');
                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return;

                    let friendlyMessage = trimmedLine;
                    const type = 'progress';

                    // Parse common pg_restore/psql verbose messages (same as local)
                    if (trimmedLine.startsWith('pg_restore: creating TABLE')) {
                        const table = trimmedLine.split('TABLE')[1].trim();
                        friendlyMessage = `🔨 Creating table: ${table}`;
                    } else if (trimmedLine.startsWith('pg_restore: restoring data for table')) {
                        const table = trimmedLine.split('table')[1].trim();
                        friendlyMessage = `📦 Restoring data for table: ${table}`;
                    } else if (trimmedLine.startsWith('pg_restore: creating INDEX')) {
                        friendlyMessage = `🔎 Creating index`;
                    } else if (trimmedLine.startsWith('pg_restore: creating CONSTRAINT')) {
                        friendlyMessage = `🔒 Creating constraint`;
                    } else if (trimmedLine.startsWith('pg_restore: processing data for table')) {
                        const table = trimmedLine.split('table')[1].trim();
                        friendlyMessage = `📦 Processing data: ${table}`;
                    }

                    progressCallback && progressCallback({
                        type: type,
                        message: friendlyMessage,
                        original: trimmedLine
                    });
                });
            });

            // We streamed the output, so no need to log the full output at the end
            // progressCallback && progressCallback({
            //    type: 'progress',
            //    message: result.output
            // });

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
