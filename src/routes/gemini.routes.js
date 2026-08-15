const express = require('express');
const router = express.Router();
const geminiController = require('../controllers/gemini.controller');
const authenticateToken = require('../middlewares/auth.middleware');

router.get('/test-key', authenticateToken, geminiController.testKey);
router.get('/logs', authenticateToken, geminiController.getLogs);
router.get('/list-models', authenticateToken, geminiController.listModels);
router.post('/chat', authenticateToken, geminiController.chat);

module.exports = router;
