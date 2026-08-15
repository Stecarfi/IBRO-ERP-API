const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const syncRoutes = require('./sync.routes');
const uploadRoutes = require('./upload.routes');
const geminiRoutes = require('./gemini.routes');
const locationRoutes = require('./location.routes');

router.use('/', authRoutes);
router.use('/', uploadRoutes);
router.use('/db', syncRoutes);
router.use('/gemini', geminiRoutes);
router.use('/location', locationRoutes);

router.get('/status', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

module.exports = router;
