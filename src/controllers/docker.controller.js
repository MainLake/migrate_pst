const dockerService = require('../services/docker');

exports.testConnection = async (req, res) => {
    try {
        const result = await dockerService.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.listContainers = async (req, res) => {
    try {
        const containers = await dockerService.listPostgresContainers();
        res.json(containers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getContainerInfo = async (req, res) => {
    try {
        const info = await dockerService.getContainerInfo(req.params.id);
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getContainerStats = async (req, res) => {
    try {
        const stats = await dockerService.getContainerStats(req.params.id);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getContainerLogs = async (req, res) => {
    try {
        const tail = req.query.tail ? parseInt(req.query.tail) : 100;
        const logs = await dockerService.getContainerLogs(req.params.id, tail);
        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
