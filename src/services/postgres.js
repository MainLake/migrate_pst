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
            return { success: true, version: result.rows[0].version };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            await client.end().catch(() => { });
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
            return result.rows.map(row => row.schema_name);
        } catch (error) {
            throw new Error(`Failed to get schemas: ${error.message}`);
        } finally {
            await client.end().catch(() => { });
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
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to get tables: ${error.message}`);
        } finally {
            await client.end().catch(() => { });
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

            return {
                columns: columnsResult.rows,
                row_count: parseInt(countResult.rows[0].count)
            };
        } catch (error) {
            throw new Error(`Failed to get table info: ${error.message}`);
        } finally {
            await client.end().catch(() => { });
        }
    }

    async previewTableData(config, schema, table, limit = 50) {
        const client = new Client({
            host: config.host,
            port: config.port || 5432,
            database: config.database,
            user: config.username,
            password: config.password,
        });

        try {
            await client.connect();
            // Use identifiers to prevent SQL injection
            const result = await client.query(`
                SELECT * FROM "${schema}"."${table}" LIMIT $1
            `, [limit]);
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to preview table data: ${error.message}`);
        } finally {
            await client.end().catch(() => { });
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
            return result.rows;
        } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
        } finally {
            await client.end().catch(() => { });
        }
    }
}

module.exports = new PostgresService();
