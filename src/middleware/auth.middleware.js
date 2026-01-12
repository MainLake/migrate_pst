const authService = require('../services/auth');

const checkAuth = (req, res, next) => {
    // If in local mode (default), skip auth
    if (process.env.APP_MODE !== 'server') {
        // Mock a user for local mode
        req.user = { id: 0, username: 'local', role: 'admin' };
        return next();
    }

    // Server mode: requires token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = authService.verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
};

module.exports = checkAuth;
