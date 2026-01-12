const configDB = require('../db/config');
const postgresService = require('../services/postgres');

exports.getConnections = async (req, res) => {
    try {
        const connections = await configDB.getConnections();
        res.json(connections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.addConnection = async (req, res) => {
    try {
        const result = await configDB.addConnection(req.body);

        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'CREATE_CONNECTION', { name: req.body.name }, req.ip);
        }

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateConnection = async (req, res) => {
    try {
        await configDB.updateConnection(req.params.id, req.body);
        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'UPDATE_CONNECTION', { id: req.params.id, name: req.body.name }, req.ip);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteConnection = async (req, res) => {
    try {
        await configDB.deleteConnection(req.params.id);
        // Audit
        if (req.user && req.user.id) {
            await configDB.addAuditLog(req.user.id, 'DELETE_CONNECTION', { id: req.params.id }, req.ip);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.testConnection = async (req, res) => {
    try {
        const result = await postgresService.testConnection(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getSchemas = async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const schemas = await postgresService.getSchemas(connection);
        res.json(schemas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTables = async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const tables = await postgresService.getTables(connection, req.params.schema);
        res.json(tables);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTableInfo = async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const info = await postgresService.getTableInfo(
            connection,
            req.params.schema,
            req.params.table
        );
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.previewTableData = async (req, res) => {
    try {
        const connection = await configDB.getConnection(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const limit = parseInt(req.query.limit) || 50;
        const data = await postgresService.previewTableData(
            connection,
            req.params.schema,
            req.params.table,
            limit
        );
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
