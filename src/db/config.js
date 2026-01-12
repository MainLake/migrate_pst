const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { encrypt, decrypt } = require('../utils/crypto');

let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  const dbPath = process.env.CONFIG_DB_PATH || './data/config.db';
  const dbDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Load existing database or create new one
  let buffer;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
  }

  dbInstance = new SQL.Database(buffer);
  return dbInstance;
}

function saveDB() {
  if (!dbInstance) return;

  const dbPath = process.env.CONFIG_DB_PATH || './data/config.db';
  const tempPath = `${dbPath}.tmp`;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);

  try {
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    console.error('Failed to save database:', error);
  }
}

class ConfigDB {
  constructor() {
    this.initPromise = this.init();
  }

  async init() {
    this.db = await getDB();

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 5432,
        database TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT,
        is_docker BOOLEAN DEFAULT 0,
        docker_container_id TEXT,
        docker_container_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS backup_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        connection_id INTEGER NOT NULL,
        schema_name TEXT NOT NULL,
        excluded_tables TEXT,
        excluded_data_tables TEXT,
        row_filters TEXT,
        format TEXT DEFAULT 'custom',
        cron_schedule TEXT,
        retention_count INTEGER,
        webhook_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(connection_id) REFERENCES connections(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER,
        connection_id INTEGER,
        schema_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(config_id) REFERENCES backup_configs(id) ON DELETE SET NULL,
        FOREIGN KEY(connection_id) REFERENCES connections(id) ON DELETE SET NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS restore_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_id INTEGER,
        target_connection_id INTEGER,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(backup_id) REFERENCES backup_history(id) ON DELETE SET NULL,
        FOREIGN KEY(target_connection_id) REFERENCES connections(id) ON DELETE SET NULL
      )
    `);

    // Users table for Server Mode
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'viewer', -- 'admin', 'viewer'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit Logs for Server Mode
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Attempt to add new columns to backup_configs if they don't exist
    try {
      this.db.run("ALTER TABLE backup_configs ADD COLUMN cron_schedule TEXT");
      this.db.run("ALTER TABLE backup_configs ADD COLUMN retention_count INTEGER");
      this.db.run("ALTER TABLE backup_configs ADD COLUMN excluded_data_tables TEXT");
      this.db.run("ALTER TABLE backup_configs ADD COLUMN webhook_url TEXT");
    } catch (e) {
      // Columns likely already exist
    }

    // Attempt to add new columns to connections if they don't exist
    try {
      this.db.run("ALTER TABLE connections ADD COLUMN docker_container_name TEXT");
    } catch (e) {
      // Column likely already exists
    }

    await this.fixBackupHistorySchema();
  }

  async fixBackupHistorySchema() {
    try {
        const result = this.db.exec("PRAGMA table_info(backup_history)");
        if (!result[0]) return;
        
        const columns = result[0].values;
        const connIdCol = columns.find(c => c[1] === 'connection_id');
        
        // Check if connection_id is NOT NULL (index 3 is 1)
        if (connIdCol && connIdCol[3] === 1) {
            console.log('🔧 Migrating backup_history table to allow NULL connection_id...');
            
            this.db.run("BEGIN TRANSACTION");
            
            // 1. Rename old table
            this.db.run("ALTER TABLE backup_history RENAME TO backup_history_old");
            
            // 2. Create new table (Correct Schema)
            this.db.run(`
              CREATE TABLE backup_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_id INTEGER,
                connection_id INTEGER,
                schema_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                status TEXT DEFAULT 'completed',
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(config_id) REFERENCES backup_configs(id) ON DELETE SET NULL,
                FOREIGN KEY(connection_id) REFERENCES connections(id) ON DELETE SET NULL
              )
            `);
            
            // 3. Copy data
            // We must map columns explicitly to be safe
            this.db.run(`
                INSERT INTO backup_history (id, config_id, connection_id, schema_name, file_path, file_size, status, error_message, created_at)
                SELECT id, config_id, connection_id, schema_name, file_path, file_size, status, error_message, created_at
                FROM backup_history_old
            `);
            
            // 4. Drop old table
            this.db.run("DROP TABLE backup_history_old");
            
            this.db.run("COMMIT");
            saveDB();
            console.log('✅ Migration completed.');
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        try { this.db.run("ROLLBACK"); } catch (e) {}
    }
  }

  // Connection methods
  async addConnection(conn) {
    await this.initPromise;
    const encryptedPassword = conn.password ? encrypt(conn.password) : null;

    // If we have an ID but no name, we might want to fetch it, but that requires dockerService which causes circular dependency if imported here.
    // Instead, we trust the caller (server.js/API) to provide the name if possible, or we rely on the self-healing to fill it in later.

    this.db.run(
      `INSERT INTO connections (name, host, port, database, username, password, is_docker, docker_container_id, docker_container_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [conn.name, conn.host, conn.port || 5432, conn.database, conn.username, encryptedPassword,
      conn.is_docker ? 1 : 0, conn.docker_container_id || null, conn.docker_container_name || null]
    );
    saveDB();
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  }

  async getConnection(id) {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM connections WHERE id = ?', [id]);
    if (!result[0] || !result[0].values[0]) return null;
    const conn = this.rowToObject(result[0].columns, result[0].values[0]);
    if (conn.password) conn.password = decrypt(conn.password);
    return conn;
  }

  async getConnections() {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM connections');
    if (!result[0]) return [];
    return result[0].values.map(row => {
      const conn = this.rowToObject(result[0].columns, row);
      if (conn.password) conn.password = decrypt(conn.password);
      return conn;
    });
  }

  async updateConnection(id, conn) {
    await this.initPromise;
    const encryptedPassword = conn.password ? encrypt(conn.password) : null;
    this.db.run(
      `UPDATE connections SET name = ?, host = ?, port = ?, database = ?, username = ?, password = ?,
      is_docker = ?, docker_container_id = ?, docker_container_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? `,
      [conn.name, conn.host, conn.port, conn.database, conn.username, encryptedPassword,
      conn.is_docker ? 1 : 0, conn.docker_container_id || null, conn.docker_container_name || null, id]
    );
    saveDB();
    return { changes: 1 };
  }

  async deleteConnection(id) {
    await this.initPromise;
    this.db.run('DELETE FROM connections WHERE id = ?', [id]);
    saveDB();
    return { changes: 1 };
  }

  // Backup config methods
  async addBackupConfig(config) {
    await this.initPromise;
    this.db.run(
      `INSERT INTO backup_configs (name, connection_id, schema_name, excluded_tables, excluded_data_tables, row_filters, format, cron_schedule, retention_count, webhook_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [config.name, config.connection_id, config.schema_name,
      JSON.stringify(config.excluded_tables || []),
      JSON.stringify(config.excluded_data_tables || []),
      JSON.stringify(config.row_filters || {}),
      config.format || 'custom',
      config.cron_schedule || null,
      config.retention_count || null,
      config.webhook_url || null]
    );
    saveDB();
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  }

  async getBackupConfigs() {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM backup_configs ORDER BY name');
    if (!result[0]) return [];
    return result[0].values.map(row => {
      const obj = this.rowToObject(result[0].columns, row);
      obj.excluded_tables = JSON.parse(obj.excluded_tables || '[]');
      obj.excluded_data_tables = JSON.parse(obj.excluded_data_tables || '[]');
      obj.row_filters = JSON.parse(obj.row_filters || '{}');
      return obj;
    });
  }

  async getBackupConfig(id) {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM backup_configs WHERE id = ?', [id]);
    if (!result[0] || !result[0].values[0]) return null;
    const config = this.rowToObject(result[0].columns, result[0].values[0]);
    config.excluded_tables = JSON.parse(config.excluded_tables || '[]');
    config.excluded_data_tables = JSON.parse(config.excluded_data_tables || '[]');
    config.row_filters = JSON.parse(config.row_filters || '{}');
    return config;
  }

  async deleteBackupConfig(id) {
    await this.initPromise;
    this.db.run('DELETE FROM backup_configs WHERE id = ?', [id]);
    saveDB();
    return { changes: 1 };
  }

  // Backup history methods
  async addBackupHistory(backup) {
    await this.initPromise;
    this.db.run(
      `INSERT INTO backup_history (config_id, connection_id, schema_name, file_path, file_size, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [backup.config_id || null, backup.connection_id, backup.schema_name, backup.file_path,
      backup.file_size || null, backup.status || 'completed', backup.error_message || null]
    );
    saveDB();
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  }

  async getBackupHistory(limit = 50) {
    await this.initPromise;
    const result = this.db.exec(`
      SELECT bh.*, c.name as connection_name 
      FROM backup_history bh
      LEFT JOIN connections c ON bh.connection_id = c.id
      ORDER BY bh.created_at DESC
      LIMIT ?
        `, [limit]);
    if (!result[0]) return [];
    return result[0].values.map(row => this.rowToObject(result[0].columns, row));
  }

  async getBackupHistoryByConfigId(configId) {
    await this.initPromise;
    const result = this.db.exec(`
      SELECT * FROM backup_history 
      WHERE config_id = ?
      ORDER BY created_at DESC
    `, [configId]);
    if (!result[0]) return [];
    return result[0].values.map(row => this.rowToObject(result[0].columns, row));
  }

  async getBackup(id) {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM backup_history WHERE id = ?', [id]);
    if (!result[0] || !result[0].values[0]) return null;
    return this.rowToObject(result[0].columns, result[0].values[0]);
  }

  async deleteBackupHistory(id) {
    await this.initPromise;
    this.db.run('DELETE FROM backup_history WHERE id = ?', [id]);
    saveDB();
    return { changes: 1 };
  }

  // Restore history methods
  async addRestoreHistory(restore) {
    await this.initPromise;
    this.db.run(
      `INSERT INTO restore_history (backup_id, target_connection_id, status, error_message)
       VALUES (?, ?, ?, ?)`,
      [restore.backup_id, restore.target_connection_id,
      restore.status || 'completed', restore.error_message || null]
    );
    saveDB();
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  }

  async getRestoreHistory(limit = 50) {
    await this.initPromise;
    const result = this.db.exec(`
      SELECT rh.*, bh.schema_name, c.name as target_connection_name
      FROM restore_history rh
      LEFT JOIN backup_history bh ON rh.backup_id = bh.id
      LEFT JOIN connections c ON rh.target_connection_id = c.id
      ORDER BY rh.created_at DESC
      LIMIT ?
        `, [limit]);
    if (!result[0]) return [];
    return result[0].values.map(row => this.rowToObject(result[0].columns, row));
  }

  // User Management
  createUser(username, passwordHash, role = 'viewer') {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [username, passwordHash, role],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  getUser(username) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare('SELECT * FROM users WHERE username = :username');
      const row = stmt.getAsObject({ ':username': username });
      stmt.free();
      // sql.js getAsObject returns empty object if no result? No, it returns row or nothing.
      // Wait, sql.js behavior: stmt.getAsObject returns object with keys, but if no row?
      // Let's use exec for safety as in other methods
      const result = this.db.exec('SELECT * FROM users WHERE username = ?', [username]);
      if (!result[0] || !result[0].values[0]) return resolve(null);
      const user = this.rowToObject(result[0].columns, result[0].values[0]);
      resolve(user);
    });
  }

  getUserById(id) {
    return new Promise((resolve, reject) => {
      const result = this.db.exec('SELECT id, username, role, created_at FROM users WHERE id = ?', [id]);
      if (!result[0] || !result[0].values[0]) return resolve(null);
      const user = this.rowToObject(result[0].columns, result[0].values[0]);
      resolve(user);
    });
  }

  listUsers() {
    return new Promise((resolve, reject) => {
      const result = this.db.exec('SELECT id, username, role, created_at FROM users ORDER BY username ASC');
      if (!result[0]) return resolve([]);
      const users = result[0].values.map(row => this.rowToObject(result[0].columns, row));
      resolve(users);
    });
  }

  // Audit Logs
  addAuditLog(userId, action, details, ipAddress) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
        [userId, action, typeof details === 'object' ? JSON.stringify(details) : details, ipAddress]
      );
      saveDB();
      resolve();
    });
  }

  getAuditLogs(limit = 100) {
    return new Promise((resolve, reject) => {
      const result = this.db.exec(`
        SELECT l.*, u.username 
        FROM audit_logs l 
        LEFT JOIN users u ON l.user_id = u.id 
        ORDER BY l.created_at DESC LIMIT ?`, [limit]);
      if (!result[0]) return resolve([]);
      const logs = result[0].values.map(row => this.rowToObject(result[0].columns, row));
      resolve(logs);
    });
  }

  // Helper
  rowToObject(columns, values) {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj;
  }

  close() {
    // sql.js databases don't need explicit closing
  }
}

module.exports = new ConfigDB();
