const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

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
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS backup_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        connection_id INTEGER NOT NULL,
        schema_name TEXT NOT NULL,
        excluded_tables TEXT,
        row_filters TEXT,
        format TEXT DEFAULT 'custom',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER,
        connection_id INTEGER NOT NULL,
        schema_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS restore_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_id INTEGER NOT NULL,
        target_connection_id INTEGER NOT NULL,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    saveDB();
  }

  rowToObject(columns, row) {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  }

  // Connection methods
  async addConnection(conn) {
    await this.initPromise;
    this.db.run(
      `INSERT INTO connections (name, host, port, database, username, password, is_docker, docker_container_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [conn.name, conn.host, conn.port || 5432, conn.database, conn.username, conn.password || null,
      conn.is_docker ? 1 : 0, conn.docker_container_id || null]
    );
    saveDB();
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result[0].values[0][0] };
  }

  async getConnections() {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM connections ORDER BY name');
    if (!result[0]) return [];
    return result[0].values.map(row => this.rowToObject(result[0].columns, row));
  }

  async getConnection(id) {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM connections WHERE id = ?', [id]);
    if (!result[0] || !result[0].values[0]) return null;
    return this.rowToObject(result[0].columns, result[0].values[0]);
  }

  async updateConnection(id, conn) {
    await this.initPromise;
    this.db.run(
      `UPDATE connections SET name = ?, host = ?, port = ?, database = ?, username = ?, password = ?,
       is_docker = ?, docker_container_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [conn.name, conn.host, conn.port, conn.database, conn.username, conn.password,
      conn.is_docker ? 1 : 0, conn.docker_container_id || null, id]
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
      `INSERT INTO backup_configs (name, connection_id, schema_name, excluded_tables, row_filters, format)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [config.name, config.connection_id, config.schema_name,
      JSON.stringify(config.excluded_tables || []),
      JSON.stringify(config.row_filters || {}),
      config.format || 'custom']
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

  async getBackup(id) {
    await this.initPromise;
    const result = this.db.exec('SELECT * FROM backup_history WHERE id = ?', [id]);
    if (!result[0] || !result[0].values[0]) return null;
    return this.rowToObject(result[0].columns, result[0].values[0]);
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

  close() {
    // sql.js databases don't need explicit closing
  }
}

module.exports = new ConfigDB();
