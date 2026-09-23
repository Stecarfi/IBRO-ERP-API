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

// 📱 Servir Aplicativo Móvil PWA e Instalador para Celulares
const mobileDir = path.join(__dirname, 'public/mobile');
app.use('/mobile', express.static(mobileDir));
app.use('/app', express.static(mobileDir));

// Rutas directas para descargar / instalar el aplicativo móvil
app.get(['/descargar', '/instalar', '/download'], (req, res) => {
    const downloadPath = path.join(mobileDir, 'descargar.html');
    if (fs.existsSync(downloadPath)) {
        return res.sendFile(downloadPath);
    }
    return res.redirect('/mobile');
});

// Descarga directa de APK si está disponible
app.get(['/api/download/apk', '/descargar/apk'], (req, res) => {
    const apkPath = path.join(__dirname, 'public/apk/ibro-erp.apk');
    if (fs.existsSync(apkPath)) {
        return res.download(apkPath, 'G-IBRO-ERP.apk');
    }
    return res.redirect('/descargar');
});

// Enrutamiento PWA Móvil
app.get(['/app', '/app/*', '/mobile', '/mobile/*'], (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    const mobileIndex = path.join(mobileDir, 'index.html');
    if (fs.existsSync(mobileIndex)) {
        return res.sendFile(mobileIndex);
    }
    next();
});

// Servir manifest e iconos en la raíz para compatibilidad PWA global
app.get('/manifest.json', (req, res, next) => {
    const manifestPath = path.join(mobileDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        res.setHeader('Content-Type', 'application/manifest+json');
        return res.sendFile(manifestPath);
    }
    next();
});

app.get(['/Rombo_Nuevo.png', '/favicon.svg'], (req, res, next) => {
    const iconPath = path.join(mobileDir, req.path.replace('/', ''));
    if (fs.existsSync(iconPath)) {
        return res.sendFile(iconPath);
    }
    next();
});

// Rutas principales de la API
app.use('/api', apiRoutes);

// Fallback SPA para frontend
app.get('*any', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return next();
    }
    const indexPath = path.join(__dirname, '../../IBRIO-ERP-APP/dist/index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    // Si se ingresa desde un celular o dispositivo móvil, redirigir directamente a IBRO ERP PWA
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
    if (isMobile) {
        return res.redirect('https://g-ibro.onrender.com');
    }

    // Para usuarios de escritorio en Render, servir portal de instalación/descarga y acceso Web
    const downloadPath = path.join(mobileDir, 'descargar.html');
    if (fs.existsSync(downloadPath)) {
        return res.sendFile(downloadPath);
    }

    res.send('G-IBRO API is running.');
});

// Setup CronJobs
setupCronJobs();

module.exports = app;
