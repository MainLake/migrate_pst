const express = require('express');
const router = express.Router();
const restoreController = require('../controllers/restore.controller');
const checkAuth = require('../middleware/auth.middleware');

router.use(checkAuth);

router.post('/restore', restoreController.restoreBackup);
router.get('/restores', restoreController.getRestoreHistory);

module.exports = router;