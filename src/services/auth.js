const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const configDB = require('../db/config');

const SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-key-123456';
const TOKEN_EXPIRY = '24h';

class AuthService {
    async register(username, password, role = 'viewer') {
        const existingUser = await configDB.getUser(username);
        if (existingUser) {
            throw new Error('Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await configDB.createUser(username, hashedPassword, role);

        return {
            id: result.id,
            username,
            role
        };
    }

    async login(username, password) {
        const user = await configDB.getUser(username);
        if (!user) {
            throw new Error('Invalid credentials');
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role
            },
            SECRET_KEY,
            { expiresIn: TOKEN_EXPIRY }
        );

        // Audit login
        await configDB.addAuditLog(user.id, 'LOGIN', 'User logged in', null);

        return {
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        };
    }

    verifyToken(token) {
        try {
            return jwt.verify(token, SECRET_KEY);
        } catch (error) {
            return null;
        }
    }

    async createInitialAdminIfNeeded() {
        const users = await configDB.listUsers();
        if (users.length === 0) {
            console.log('Creating default admin user (admin/admin)...');
            await this.register('admin', 'admin', 'admin');
        }
    }
}

module.exports = new AuthService();
