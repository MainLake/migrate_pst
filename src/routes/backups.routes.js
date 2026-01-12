const express = require('express');
const router = express.Router();
const backupsController = require('../controllers/backups.controller');
const checkAuth = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

router.use(checkAuth);

// Operations
router.post('/', backupsController.createBackup);
router.post('/from-config/:configId', backupsController.createBackupFromConfig);
router.get('/', backupsController.getBackupHistory);
router.get('/:id/download', backupsController.downloadBackup);
router.post('/upload', upload.single('backup'), backupsController.uploadBackup);
router.delete('/:id', backupsController.deleteBackup);

module.exports = router;