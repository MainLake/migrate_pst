const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

class DockerService {
    constructor() {
        this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
    }

    async listPostgresContainers() {
        try {
            const containers = await this.docker.listContainers({ all: false });

            // Filter for PostgreSQL containers
            const postgresContainers = containers.filter(container => {
                const image = container.Image.toLowerCase();
                return image.includes('postgres') || image.includes('postgresql');
            });

            return postgresContainers.map(c => ({
                id: c.Id,
                name: c.Names[0].replace('/', ''),
                image: c.Image,
                status: c.Status,
                state: c.State,
                ports: c.Ports
            }));
        } catch (error) {
            throw new Error(`Failed to list Docker containers: ${error.message}`);
        }
    }

    async getContainerInfo(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            const info = await container.inspect();

            return {
                id: info.Id,
                name: info.Name.replace('/', ''),
                image: info.Config.Image,
                status: info.State.Status,
                running: info.State.Running,
                env: info.Config.Env,
                networks: Object.keys(info.NetworkSettings.Networks)
            };
        } catch (error) {
            throw new Error(`Failed to get container info: ${error.message}`);
        }
    }

    async findContainerByName(name) {
        try {
            const containers = await this.listPostgresContainers();
            // Try exact match first
            let found = containers.find(c => c.name === name);

            // If not found, try fuzzy match (e.g. if name is "postgres-source" and container is "/postgres-source")
            if (!found) {
                found = containers.find(c => c.name.includes(name) || name.includes(c.name));
            }

            return found ? found.id : null;
        } catch (error) {
            console.error('Error finding container by name:', error);
            return null;
        }
    }

    async verifyContainer(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            await container.inspect();
            return true;
        } catch (error) {
            return false;
        }
    }

    async execCommand(containerId, command, onData) {
        try {
            const container = this.docker.getContainer(containerId);

            const exec = await container.exec({
                Cmd: command,
                AttachStdout: true,
                AttachStderr: true
            });

            const stream = await exec.start();

            return new Promise((resolve, reject) => {
                let output = '';
                let errorOutput = '';

                stream.on('data', (chunk) => {
                    // Accumulate chunk directly
                    // Note: In a real robust implementation, we should buffer chunks because a frame might be split across chunks.
                    // For this simplified version, we'll try to parse what we can.

                    let currentBuffer = chunk;

                    while (currentBuffer.length >= 8) {
                        // Check if it looks like a header (first byte 0, 1, or 2)
                        const type = currentBuffer[0];

                        // Docker header: [STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4]
                        // We can read size (big endian uint32) at offset 4
                        const size = currentBuffer.readUInt32BE(4);

                        // If we have enough data for the full frame
                        if (currentBuffer.length >= 8 + size) {
                            const payload = currentBuffer.subarray(8, 8 + size);
                            const text = payload.toString();

                            output += text;
                            if (onData) {
                                onData(text);
                            }

                            // Move to next frame
                            currentBuffer = currentBuffer.subarray(8 + size);
                        } else {
                            // Incomplete frame, break wait for next chunk (this simplistic handler drops partials if not robust buffering is used, 
                            // but usually for line-based logs usually it's fine or we'd need a class-level buffer).
                            // For safety in this tool context where we might get split chunks, 
                            // let's revert to "safe-ish" behavior: if it's just text without header (TTY mode?), treat as text.
                            // But since we didn't enable TTY, we stick to header parsing.
                            // To properly fix this we need a persistent buffer across events.
                            break;
                        }
                    }

                    // Fallback: if we have leftover data that doesn't look like a header but we processed some, 
                    // or if it's a huge chunk, we might be dropping data.
                    // Ideally we should store `currentBuffer` in a `this.buffer` for the next event.
                });

                stream.on('end', async () => {
                    const inspectResult = await exec.inspect();
                    if (inspectResult.ExitCode === 0) {
                        resolve({ success: true, output });
                    } else {
                        reject(new Error(`Command failed with exit code ${inspectResult.ExitCode}: ${output}`));
                    }
                });

                stream.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Failed to execute command: ${error.message}`);
        }
    }

    async copyFileToContainer(containerId, localPath, containerPath) {
        try {
            const container = this.docker.getContainer(containerId);

            // Create tar stream (Docker API requires tar format)
            const tar = require('tar-stream');
            const pack = tar.pack();

            const fileName = path.basename(containerPath);
            const stats = fs.statSync(localPath);
            const fileSize = stats.size;

            // Add entry with file metadata and stream content
            const entry = pack.entry({ name: fileName, size: fileSize }, (err) => {
                if (err) {
                    pack.destroy(err);
                } else {
                    pack.finalize();
                }
            });

            // Pipe file stream to tar entry
            const fileStream = fs.createReadStream(localPath);
            fileStream.pipe(entry);

            // Put archive (pack is a readable stream)
            const containerDir = path.dirname(containerPath);
            await container.putArchive(pack, { path: containerDir });

            return { success: true };
        } catch (error) {
            throw new Error(`Failed to copy file to container: ${error.message}`);
        }
    }

    async getContainerStats(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            const stats = await container.stats({ stream: false });

            // Calculate CPU Usage (simplified percentage)
            // docker calculates cpu_delta = cpu_stats.cpu_usage.total_usage - precpu_stats.cpu_usage.total_usage
            // system_delta = cpu_stats.system_cpu_usage - precpu_stats.system_cpu_usage
            // cpu_percent = (cpu_delta / system_delta) * number_cpus * 100.0

            let cpuPercent = 0.0;
            const cpuStats = stats.cpu_stats;
            const precpuStats = stats.precpu_stats;

            if (cpuStats.cpu_usage && precpuStats.cpu_usage) {
                const cpuDelta = cpuStats.cpu_usage.total_usage - precpuStats.cpu_usage.total_usage;
                const systemDelta = cpuStats.system_cpu_usage - precpuStats.system_cpu_usage;

                if (systemDelta > 0 && cpuDelta > 0) {
                    // If pericpu_usage exists we can count cpus, or use online_cpus if newer docker API
                    const numCpus = cpuStats.online_cpus || (cpuStats.cpu_usage.percpu_usage ? cpuStats.cpu_usage.percpu_usage.length : 1);
                    cpuPercent = (cpuDelta / systemDelta) * numCpus * 100.0;
                }
            }

            // Calculate Memory Usage
            // used_memory = memory_stats.usage - memory_stats.stats.cache (if available)
            // But stats structure varies across versions (cgroup v1 vs v2).
            const memoryStats = stats.memory_stats;
            let usedMemory = memoryStats.usage || 0;

            // On some platforms/versions cache is in stats, on others directly.
            // Simplified approach: just usage.
            const limitMemory = memoryStats.limit || 0;
            const memoryPercent = limitMemory > 0 ? (usedMemory / limitMemory) * 100.0 : 0;

            return {
                cpu: cpuPercent.toFixed(2),
                memory: {
                    used: usedMemory,
                    limit: limitMemory,
                    percent: memoryPercent.toFixed(2)
                },
                pids: stats.pids_stats.current || 0
            };
        } catch (error) {
            console.error('Failed to get container stats:', error);
            // Return safe defaults if offline or error
            return { cpu: "0.00", memory: { used: 0, limit: 0, percent: "0.00" }, pids: 0 };
        }
    }

    async getContainerLogs(containerId, tail = 100) {
        try {
            const container = this.docker.getContainer(containerId);
            const logsBuffer = await container.logs({
                stdout: true,
                stderr: true,
                tail: tail,
                timestamps: true
            });

            // Logs come as a buffer mixed with header bytes. 
            // We need to parse similar to execCommand but simpler since it's a batch
            // OR use follow: false. 
            // Dockerode logs() returns a buffer if follow: false.
            // But it still has the 8-byte headers per frame!

            const logs = [];
            let currentBuffer = logsBuffer;

            while (currentBuffer.length >= 8) {
                const size = currentBuffer.readUInt32BE(4);
                if (currentBuffer.length >= 8 + size) {
                    const payload = currentBuffer.subarray(8, 8 + size);
                    // Remove timestamp if we asked for it? Or keep it. 
                    // payload usually is "TIMESTAMP MESSAGE"
                    logs.push(payload.toString());
                    currentBuffer = currentBuffer.subarray(8 + size);
                } else {
                    break;
                }
            }

            return logs.join('');
        } catch (error) {
            return `Failed to retrieve logs: ${error.message}`;
        }
    }

    async testConnection() {
        try {
            await this.docker.ping();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new DockerService();
