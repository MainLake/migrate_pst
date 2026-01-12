const express = require('express');
const router = express.Router();
const dockerController = require('../controllers/docker.controller');
const checkAuth = require('../middleware/auth.middleware');

router.use(checkAuth);

router.get('/test', dockerController.testConnection);
router.get('/containers', dockerController.listContainers);
router.get('/containers/:id', dockerController.getContainerInfo);
router.get('/containers/:id/stats', dockerController.getContainerStats);
router.get('/containers/:id/logs', dockerController.getContainerLogs);

module.exports = router;
