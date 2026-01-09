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

    async execCommand(containerId, command) {
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
                    const data = chunk.toString();
                    // Docker exec stream has 8-byte header, skip it
                    const cleanData = data.substring(8);
                    output += cleanData;
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

            // Read file
            const fileContent = fs.readFileSync(localPath);

            // Create tar stream (Docker API requires tar format)
            const tar = require('tar-stream');
            const pack = tar.pack();

            const fileName = path.basename(containerPath);
            pack.entry({ name: fileName }, fileContent, (err) => {
                if (err) throw err;
                pack.finalize();
            });

            // Put archive
            const containerDir = path.dirname(containerPath);
            await container.putArchive(pack, { path: containerDir });

            return { success: true };
        } catch (error) {
            throw new Error(`Failed to copy file to container: ${error.message}`);
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
