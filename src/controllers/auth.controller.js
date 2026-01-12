const authService = require('../services/auth');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await authService.login(username, password);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

exports.me = (req, res) => {
    res.json({
        mode: process.env.APP_MODE || 'local',
        user: req.user
    });
};

exports.initAdmin = async () => {
    if (process.env.APP_MODE === 'server') {
        await authService.createInitialAdminIfNeeded().catch(console.error);
    }
};
