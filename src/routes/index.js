const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const syncRoutes = require('./sync.routes');
const uploadRoutes = require('./upload.routes');
const geminiRoutes = require('./gemini.routes');
const locationRoutes = require('./location.routes');
const campoRoutes = require('./campo.routes');
const pushRoutes = require('./push.routes');

router.use('/', authRoutes);
router.use('/', uploadRoutes);
router.use('/upload', uploadRoutes);
router.use('/db', syncRoutes);
router.use('/gemini', geminiRoutes);
router.use('/location', locationRoutes);
router.use('/operaciones-campo', campoRoutes);
router.use('/campo', campoRoutes);
router.use('/push', pushRoutes);

router.get('/status', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

module.exports = router;
