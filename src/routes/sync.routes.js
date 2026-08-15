const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');
const authenticateToken = require('../middlewares/auth.middleware');

router.get('/', authenticateToken, syncController.getDb);
router.post('/sync', authenticateToken, syncController.sync);
router.post('/informes-config', authenticateToken, syncController.updateInformesConfig);

module.exports = router;
