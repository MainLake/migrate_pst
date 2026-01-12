const express = require('express');
const router = express.Router();
const backupsController = require('../controllers/backups.controller');
const checkAuth = require('../middleware/auth.middleware');

router.use(checkAuth);

router.get('/', backupsController.getBackupConfigs);
router.post('/', backupsController.addBackupConfig);
router.delete('/:id', backupsController.deleteBackupConfig);

module.exports = router;
