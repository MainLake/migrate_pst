const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const checkAuth = require('../middleware/auth.middleware');

router.post('/login', authController.login);
router.get('/me', checkAuth, authController.me);

module.exports = router;
