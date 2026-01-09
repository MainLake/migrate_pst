const { Client } = require('pg');

class PostgresService {
    async testConnection(config) {
        const client = new Client({
            host: config.host,
            port: config.port || 5432,
            database: config.database,
            user: config.username,
            password: config.password,
        });

        try {
            await client.connect();
            const result = await client.query('SELECT version()');
            await client.end();
            return { success: true, version: result.rows[0].version };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getSchemas(config) {
        const client = new Client({
            host: config.host,
            port: config.port || 5432,
            database: config.database,
            user: config.username,
            password: config.password,
        });

        try {
            await client.connect();
            const result = await client.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schema_name
      `);
            await client.end();
            return result.rows.map(row => row.schema_name);
        } catch (error) {
            throw new Error(`Failed to get schemas: ${error.message}`);
        }
    }

    async getTables(config, schema) {
        const client = new Client({
            host: config.host,
            port: config.port || 5432,
            database: config.database,
            user: config.username,
            password: config.password,
        });

        try {
            await client.connect();
            const result = await client.query(`
        SELECT 
          table_name,
          (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count
        FROM information_schema.tables t
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, [schema]);
            await client.end();
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to get tables: ${error.message}`);
        }
    }

    async getTableInfo(config, schema, table) {
        const client = new Client({
            host: config.host,
            port: config.port || 5432,
            database: config.database,
            user: config.username,
            password: config.password,
        });

        try {
            await client.connect();

            // Get columns
            const columnsResult = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, table]);

            // Get row count (with limit to avoid performance issues)
            const countResult = await client.query(`
        SELECT COUNT(*) as count FROM "${schema}"."${table}"
      `);

            await client.end();

            return {
                columns: columnsResult.rows,
                row_count: parseInt(countResult.rows[0].count)
            };
        } catch (error) {
            throw new Error(`Failed to get table info: ${error.message}`);
        }
    }

    async executeQuery(config, query) {
        const client = new Client({
            host: config.host,
            port: config.port || 5432,
            database: config.database,
            user: config.username,
            password: config.password,
        });

        try {
            await client.connect();
            const result = await client.query(query);
            await client.end();
            return result.rows;
        } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
        }
    }
}

module.exports = new PostgresService();
