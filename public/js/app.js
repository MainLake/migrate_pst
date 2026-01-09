// Main Application
class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.ws = null;
        this.connections = [];
        this.backups = [];
        this.dockerContainers = [];
        this.excludedTables = new Set();
        this.excludedDataTables = new Set();
        this.allTables = [];
        this.selectedTables = new Set();

        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupWebSocket();
        this.setupForms();
        await this.loadInitialData();
    }

    // Navigation
    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.navigateTo(page);
            });
        });
    }

    navigateTo(page) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === page) {
                item.classList.add('active');
            }
        });

        // Update pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        document.getElementById(page).classList.add('active');

        this.currentPage = page;

        // Load page-specific data
        this.loadPageData(page);
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'connections':
                await this.loadConnections();
                break;
            case 'backup':
                await this.loadBackupPage();
                break;
            case 'restore':
                await this.loadRestorePage();
                break;
            case 'history':
                await this.loadHistory();
                break;
            case 'docker':
                await this.loadDockerContainers();
                break;
            case 'tutorial':
                // Tutorial page is static, no data to load
                break;
        }
    }

    // WebSocket
    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, reconnecting...');
            setTimeout(() => this.setupWebSocket(), 3000);
        };
    }

    handleWebSocketMessage(data) {
        const technicalSection = document.getElementById('technical-details-section');
        const outputDiv = document.getElementById('backup-output');
        const cmdDiv = document.getElementById('backup-command');

        switch (data.type) {
            case 'backup_started':
                this.updateBackupStatus('Iniciando backup...', 'info');
                // Show technical details section
                if (technicalSection) {
                    technicalSection.style.display = 'block';
                }
                // Clear previous output
                if (outputDiv) {
                    outputDiv.innerHTML = '<div style="color: var(--accent-primary);">⏳ Iniciando proceso...</div>';
                }
                break;

            case 'backup_command':
                // Display the actual pg_dump command
                if (cmdDiv && data.command) {
                    cmdDiv.textContent = data.command;
                }
                break;

            case 'backup_progress':
                this.updateBackupStatus(data.message, 'info');
                // Append to output
                if (outputDiv && data.message) {
                    const line = document.createElement('div');
                    line.textContent = data.message;
                    line.style.marginBottom = '0.25rem';
                    outputDiv.appendChild(line);
                    // Auto scroll to bottom
                    outputDiv.scrollTop = outputDiv.scrollHeight;
                }
                break;

            case 'backup_completed':
                this.updateBackupStatus('✅ Backup completado exitosamente!', 'success');
                this.loadDashboard();
                if (outputDiv) {
                    const line = document.createElement('div');
                    line.style.color = 'var(--success)';
                    line.style.fontWeight = 'bold';
                    line.style.marginTop = '0.5rem';
                    line.textContent = `✅ Completado - Archivo: ${data.file_path || 'N/A'}`;
                    outputDiv.appendChild(line);
                    outputDiv.scrollTop = outputDiv.scrollHeight;
                }
                break;

            case 'backup_failed':
                this.updateBackupStatus(`❌ Error: ${data.error}`, 'error');
                if (outputDiv) {
                    const line = document.createElement('div');
                    line.style.color = 'var(--error)';
                    line.style.fontWeight = 'bold';
                    line.style.marginTop = '0.5rem';
                    line.textContent = `❌ Error: ${data.error}`;
                    outputDiv.appendChild(line);
                    outputDiv.scrollTop = outputDiv.scrollHeight;
                }
                break;

            case 'restore_started':
                this.updateRestoreStatus('Iniciando restauración...', 'info');
                break;

            case 'restore_progress':
                this.updateRestoreStatus(data.message, 'info');
                break;

            case 'restore_completed':
                this.updateRestoreStatus('✅ Restauración completada exitosamente!', 'success');
                break;

            case 'restore_failed':
                this.updateRestoreStatus(`❌ Error: ${data.error}`, 'error');
                break;
        }
    }

    updateBackupStatus(message, type = 'info') {
        const statusEl = document.getElementById('backup-status');
        const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-info';
        statusEl.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    }

    updateRestoreStatus(message, type = 'info') {
        const statusEl = document.getElementById('restore-status');
        const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-info';
        statusEl.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    }

    // API Calls
    async api(endpoint, options = {}) {
        try {
            const response = await fetch(`/api${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Initial Data Load
    async loadInitialData() {
        await this.loadConnections();
        await this.loadDashboard();
    }

    // Dashboard
    async loadDashboard() {
        try {
            const [backups, restores, connections] = await Promise.all([
                this.api('/backups?limit=10'),
                this.api('/restores?limit=5'),
                this.api('/connections')
            ]);

            // Stats
            const statsHtml = `
        <div class="card">
          <div class="card-body">
            <div style="font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              ${connections.length}
            </div>
            <div style="color: var(--text-secondary); margin-top: 0.5rem;">Conexiones</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <div style="font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, var(--success), var(--primary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              ${backups.length}
            </div>
            <div style="color: var(--text-secondary); margin-top: 0.5rem;">Backups</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <div style="font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, var(--accent), var(--warning)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              ${restores.length}
            </div>
            <div style="color: var(--text-secondary); margin-top: 0.5rem;">Restauraciones</div>
          </div>
        </div>
      `;
            document.getElementById('dashboard-stats').innerHTML = statsHtml;

            // Recent backups
            if (backups.length === 0) {
                document.getElementById('recent-backups').innerHTML = `
          <p class="text-center" style="padding: 2rem; color: var(--text-tertiary);">
            No hay backups todavía. <a href="#" onclick="app.navigateTo('backup')" style="color: var(--primary);">Crear uno ahora</a>
          </p>
        `;
            } else {
                const backupsHtml = backups.map(backup => `
          <div style="padding: 1rem; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${backup.schema_name}</div>
              <div style="font-size: 0.875rem; color: var(--text-secondary);">
                ${backup.connection_name} • ${this.formatDate(backup.created_at)} • ${this.formatBytes(backup.file_size)}
              </div>
            </div>
            <span class="badge badge-${backup.status === 'completed' ? 'success' : 'error'}">${backup.status}</span>
          </div>
        `).join('');
                document.getElementById('recent-backups').innerHTML = backupsHtml;
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    // Connections
    async loadConnections() {
        try {
            this.connections = await this.api('/connections');

            const tbody = document.getElementById('connections-list');
            if (this.connections.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 2rem;">No hay conexiones. Crea una nueva.</td></tr>';
                return;
            }

            tbody.innerHTML = this.connections.map(conn => `
        <tr>
          <td style="font-weight: 600; color: var(--text-primary);">${conn.name}</td>
          <td>${conn.host}:${conn.port}</td>
          <td>${conn.database}</td>
          <td>${conn.is_docker ? '<span class="badge badge-info">Docker</span>' : '<span class="badge">Local</span>'}</td>
          <td><span class="badge badge-success">Activa</span></td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="app.deleteConnection(${conn.id})">🗑️</button>
          </td>
        </tr>
      `).join('');

            // Update connection selects
            this.updateConnectionSelects();
        } catch (error) {
            console.error('Error loading connections:', error);
        }
    }

    updateConnectionSelects() {
        const selects = ['backup-connection', 'restore-connection'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Seleccionar conexión...</option>' +
                    this.connections.map(conn =>
                        `<option value="${conn.id}">${conn.name} (${conn.database})</option>`
                    ).join('');
            }
        });
    }

    showAddConnectionModal() {
        document.getElementById('add-connection-modal').classList.add('active');
        this.loadDockerContainersForModal();
    }

    closeAddConnectionModal() {
        document.getElementById('add-connection-modal').classList.remove('active');
        document.getElementById('add-connection-form').reset();
    }

    async loadDockerContainersForModal() {
        try {
            const containers = await this.api('/docker/containers');
            const select = document.getElementById('conn-docker-container');
            select.innerHTML = '<option value="">Seleccionar contenedor...</option>' +
                containers.map(c => `<option value="${c.id}">${c.name} (${c.image})</option>`).join('');
        } catch (error) {
            console.error('Error loading Docker containers:', error);
        }
    }

    async testConnection() {
        const form = document.getElementById('add-connection-form');
        const formData = new FormData(form);
        const data = {
            host: document.getElementById('conn-host').value,
            port: parseInt(document.getElementById('conn-port').value),
            database: document.getElementById('conn-database').value,
            username: document.getElementById('conn-username').value,
            password: document.getElementById('conn-password').value
        };

        const resultEl = document.getElementById('connection-test-result');
        resultEl.innerHTML = '<div class="alert alert-info">Probando conexión...</div>';

        try {
            const result = await this.api('/connections/test', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            if (result.success) {
                resultEl.innerHTML = `<div class="alert alert-success">✅ Conexión exitosa! ${result.version}</div>`;
            } else {
                resultEl.innerHTML = `<div class="alert alert-error">❌ Error: ${result.error}</div>`;
            }
        } catch (error) {
            resultEl.innerHTML = `<div class="alert alert-error">❌ Error: ${error.message}</div>`;
        }
    }

    async deleteConnection(id) {
        if (!confirm('¿Estás seguro de eliminar esta conexión?')) return;

        try {
            await this.api(`/connections/${id}`, { method: 'DELETE' });
            await this.loadConnections();
        } catch (error) {
            alert('Error al eliminar conexión: ' + error.message);
        }
    }

    // Backup Page
    async loadBackupPage() {
        this.updateConnectionSelects();

        // Setup connection change handler
        const connSelect = document.getElementById('backup-connection');
        connSelect.addEventListener('change', async (e) => {
            const connId = e.target.value;
            if (connId) {
                await this.loadSchemas(connId);
            }
        });

        // Setup schema change handler
        const schemaSelect = document.getElementById('backup-schema');
        schemaSelect.addEventListener('change', async (e) => {
            const schema = e.target.value;
            const connId = connSelect.value;
            if (schema && connId) {
                await this.loadTables(connId, schema);
            }
        });

        // Setup technical details toggle
        const toggleBtn = document.getElementById('toggle-technical-details');
        const detailsContent = document.getElementById('technical-details-content');
        const detailsIcon = document.getElementById('details-icon');

        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const isHidden = detailsContent.style.display === 'none';
                detailsContent.style.display = isHidden ? 'block' : 'none';
                detailsIcon.textContent = isHidden ? '▲' : '▼';
            };
        }
    }

    async loadSchemas(connectionId) {
        try {
            const schemas = await this.api(`/connections/${connectionId}/schemas`);
            const select = document.getElementById('backup-schema');
            select.innerHTML = '<option value="">Seleccionar esquema...</option>' +
                schemas.map(s => `<option value="${s}">${s}</option>`).join('');
        } catch (error) {
            console.error('Error loading schemas:', error);
        }
    }

    async loadTables(connectionId, schema) {
        try {
            const tables = await this.api(`/connections/${connectionId}/schemas/${schema}/tables`);
            this.allTables = tables;
            const container = document.getElementById('backup-tables-list');

            if (tables.length === 0) {
                container.innerHTML = '<p class="text-center" style="color: var(--text-tertiary);">No hay tablas en este esquema</p>';
                return;
            }

            this.renderTables(tables);

            // Setup search
            const searchInput = document.getElementById('table-search');
            searchInput.oninput = (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filtered = this.allTables.filter(t =>
                    t.table_name.toLowerCase().includes(searchTerm)
                );
                this.renderTables(filtered);
            };

            // Setup mode change handlers
            const modeRadios = document.querySelectorAll('input[name="exclude-mode"]');
            modeRadios.forEach(radio => {
                radio.onchange = () => {
                    // Clear selections when switching modes
                    this.excludedTables.clear();
                    this.excludedDataTables.clear();
                    this.renderTables(this.allTables);
                };
            });
        } catch (error) {
            console.error('Error loading tables:', error);
        }
    }

    renderTables(tables) {
        const container = document.getElementById('backup-tables-list');
        const mode = document.querySelector('input[name="exclude-mode"]:checked').value;
        const excludeSet = mode === 'complete' ? this.excludedTables : this.excludedDataTables;

        container.innerHTML = tables.map(table => {
            const isChecked = excludeSet.has(table.table_name);
            return `
        <label class="form-checkbox table-item" style="margin-bottom: 0.5rem;">
          <input type="checkbox" class="table-checkbox" value="${table.table_name}" ${isChecked ? 'checked' : ''}>
          <span>${table.table_name} <span style="color: var(--text-tertiary); font-size: 0.875rem;">(${table.column_count} columnas)</span></span>
        </label>
      `;
        }).join('');

        // Add event listeners to checkboxes
        document.querySelectorAll('.table-checkbox').forEach(cb => {
            cb.onchange = (e) => {
                const tableName = e.target.value;
                if (e.target.checked) {
                    excludeSet.add(tableName);
                } else {
                    excludeSet.delete(tableName);
                }
            };
        });
    }

    // Restore Page
    async loadRestorePage() {
        await this.loadBackupsForRestore();
        this.updateConnectionSelects();

        const backupSelect = document.getElementById('restore-backup');
        backupSelect.addEventListener('change', (e) => {
            const backupId = e.target.value;
            if (backupId) {
                this.showBackupInfo(backupId);
                document.getElementById('restore-btn').disabled = !document.getElementById('restore-connection').value;
            }
        });

        const connSelect = document.getElementById('restore-connection');
        connSelect.addEventListener('change', (e) => {
            document.getElementById('restore-btn').disabled = !backupSelect.value;
        });
    }

    async loadBackupsForRestore() {
        try {
            this.backups = await this.api('/backups');
            const select = document.getElementById('restore-backup');
            select.innerHTML = '<option value="">Seleccionar backup...</option>' +
                this.backups.filter(b => b.status === 'completed').map(b =>
                    `<option value="${b.id}">${b.schema_name} - ${this.formatDate(b.created_at)} (${this.formatBytes(b.file_size)})</option>`
                ).join('');
        } catch (error) {
            console.error('Error loading backups:', error);
        }
    }

    showBackupInfo(backupId) {
        const backup = this.backups.find(b => b.id == backupId);
        if (!backup) return;

        const infoEl = document.getElementById('restore-backup-info');
        infoEl.classList.remove('hidden');
        infoEl.innerHTML = `
      <div class="alert alert-info" style="margin-top: 1rem;">
        <strong>Información del Backup:</strong><br>
        Esquema: ${backup.schema_name}<br>
        Conexión: ${backup.connection_name}<br>
        Fecha: ${this.formatDate(backup.created_at)}<br>
        Tamaño: ${this.formatBytes(backup.file_size)}
      </div>
    `;
    }

    // History
    async loadHistory() {
        try {
            const [backups, restores] = await Promise.all([
                this.api('/backups'),
                this.api('/restores')
            ]);

            // Backup history
            const backupTbody = document.getElementById('backup-history-list');
            if (backups.length === 0) {
                backupTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 2rem;">No hay backups</td></tr>';
            } else {
                backupTbody.innerHTML = backups.map(b => `
          <tr>
            <td>${this.formatDate(b.created_at)}</td>
            <td>${b.connection_name || 'N/A'}</td>
            <td>${b.schema_name}</td>
            <td>${this.formatBytes(b.file_size)}</td>
            <td><span class="badge badge-${b.status === 'completed' ? 'success' : 'error'}">${b.status}</span></td>
            <td>
              <button class="btn btn-danger btn-sm" onclick="app.deleteBackup(${b.id})">🗑️</button>
            </td>
          </tr>
        `).join('');
            }

            // Restore history
            const restoreTbody = document.getElementById('restore-history-list');
            if (restores.length === 0) {
                restoreTbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 2rem;">No hay restauraciones</td></tr>';
            } else {
                restoreTbody.innerHTML = restores.map(r => `
          <tr>
            <td>${this.formatDate(r.created_at)}</td>
            <td>${r.schema_name || 'N/A'}</td>
            <td>${r.target_connection_name || 'N/A'}</td>
            <td><span class="badge badge-${r.status === 'completed' ? 'success' : 'error'}">${r.status}</span></td>
          </tr>
        `).join('');
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async deleteBackup(id) {
        if (!confirm('¿Eliminar este backup?')) return;

        try {
            await this.api(`/backups/${id}`, { method: 'DELETE' });
            await this.loadHistory();
            await this.loadDashboard();
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    // Docker
    async loadDockerContainers() {
        try {
            this.dockerContainers = await this.api('/docker/containers');
            const tbody = document.getElementById('docker-containers-list');

            if (this.dockerContainers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem;">No hay contenedores PostgreSQL</td></tr>';
                return;
            }

            tbody.innerHTML = this.dockerContainers.map(c => `
        <tr>
          <td style="font-weight: 600; color: var(--text-primary);">${c.name}</td>
          <td>${c.image}</td>
          <td><span class="badge badge-${c.state === 'running' ? 'success' : 'error'}">${c.state}</span></td>
          <td>${c.ports.map(p => p.PublicPort ? `${p.PublicPort}→${p.PrivatePort}` : p.PrivatePort).join(', ')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="app.addDockerConnection('${c.id}', '${c.name}')">
              ➕ Crear Conexión
            </button>
          </td>
        </tr>
      `).join('');
        } catch (error) {
            console.error('Error loading Docker containers:', error);
            const tbody = document.getElementById('docker-containers-list');
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem; color: var(--error);">Error: Docker no está disponible</td></tr>';
        }
    }

    addDockerConnection(containerId, containerName) {
        this.showAddConnectionModal();
        document.getElementById('conn-name').value = containerName;
        document.getElementById('conn-is-docker').checked = true;
        document.getElementById('docker-container-group').classList.remove('hidden');
        document.getElementById('conn-docker-container').value = containerId;
    }

    // Forms
    setupForms() {
        // Add connection form
        document.getElementById('add-connection-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addConnection();
        });

        // Docker checkbox toggle
        document.getElementById('conn-is-docker').addEventListener('change', (e) => {
            const dockerGroup = document.getElementById('docker-container-group');
            if (e.target.checked) {
                dockerGroup.classList.remove('hidden');
            } else {
                dockerGroup.classList.add('hidden');
            }
        });

        // Backup form
        document.getElementById('backup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createBackup();
        });

        // Restore button
        document.getElementById('restore-btn').addEventListener('click', async () => {
            await this.restoreBackup();
        });
    }

    async addConnection() {
        const data = {
            name: document.getElementById('conn-name').value,
            host: document.getElementById('conn-host').value,
            port: parseInt(document.getElementById('conn-port').value),
            database: document.getElementById('conn-database').value,
            username: document.getElementById('conn-username').value,
            password: document.getElementById('conn-password').value,
            is_docker: document.getElementById('conn-is-docker').checked,
            docker_container_id: document.getElementById('conn-is-docker').checked
                ? document.getElementById('conn-docker-container').value
                : null
        };

        try {
            await this.api('/connections', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            this.closeAddConnectionModal();
            await this.loadConnections();
            this.navigateTo('connections');
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    async createBackup() {
        const connectionId = document.getElementById('backup-connection').value;
        const schema = document.getElementById('backup-schema').value;
        const format = document.getElementById('backup-format').value;

        const data = {
            connectionId: parseInt(connectionId),
            schema,
            excludedTables: Array.from(this.excludedTables),
            excludedDataTables: Array.from(this.excludedDataTables),
            format
        };
        try {
            this.updateBackupStatus('Iniciando backup...', 'info');
            await this.api('/backups', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } catch (error) {
            this.updateBackupStatus(`Error: ${error.message}`, 'error');
        }
    }

    async restoreBackup() {
        const backupId = parseInt(document.getElementById('restore-backup').value);
        const targetConnectionId = parseInt(document.getElementById('restore-connection').value);

        if (!confirm('¿Estás seguro de restaurar este backup? Esto puede sobrescribir datos existentes.')) {
            return;
        }

        try {
            this.updateRestoreStatus('Iniciando restauración...', 'info');
            await this.api('/restore', {
                method: 'POST',
                body: JSON.stringify({ backupId, targetConnectionId })
            });
        } catch (error) {
            this.updateRestoreStatus(`Error: ${error.message}`, 'error');
        }
    }

    // Utilities
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatBytes(bytes) {
        if (!bytes) return 'N/A';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }
}

// Initialize app
const app = new App();
