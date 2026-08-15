const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const { uploadsDir } = require('./middlewares/upload.middleware');
const apiRoutes = require('./routes/index');
const { setupCronJobs } = require('./cron/backup');

const app = express();

// Confianza de proxy (Para Render)
app.set('trust proxy', 1);

// Middlewares base
app.use(cookieParser());
app.use(cors({
    origin: function(origin, callback) {
        callback(null, true);
    },
    credentials: true
}));

// Payload Limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Global API rate limiter
app.use('/api/', apiLimiter);

// Archivos estáticos
app.use('/uploads', express.static(uploadsDir));
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));
app.use(express.static(path.join(__dirname, '../../IBRIO-ERP-APP/dist')));

// Rutas principales de la API
app.use('/api', apiRoutes);

// Fallback SPA para frontend
app.get('*any', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return next();
    }
    const indexPath = path.join(__dirname, '../../IBRIO-ERP-APP/dist/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('G-IBRO API is running.');
    }
});

// Setup CronJobs
setupCronJobs();

module.exports = app;
