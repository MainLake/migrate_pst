const express = require('express');
const router = express.Router();
const connectionsController = require('../controllers/connections.controller');
const checkAuth = require('../middleware/auth.middleware');

router.use(checkAuth);

router.get('/', connectionsController.getConnections);
router.post('/', connectionsController.addConnection);
router.put('/:id', connectionsController.updateConnection);
router.delete('/:id', connectionsController.deleteConnection);
router.post('/test', connectionsController.testConnection);
router.get('/:id/schemas', connectionsController.getSchemas);
router.get('/:id/schemas/:schema/tables', connectionsController.getTables);
router.get('/:id/schemas/:schema/tables/:table', connectionsController.getTableInfo);
router.get('/:id/schemas/:schema/tables/:table/preview', connectionsController.previewTableData);

module.exports = router;
