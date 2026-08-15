const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { uploadAvatar, uploadEvidence } = require('../middlewares/upload.middleware');
const multer = require('multer');

// Reutilizamos el storage de middlewares para las cargas genéricas
const { uploadsDir } = require('../middlewares/upload.middleware');
const crypto = require('crypto');
const path = require('path');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, crypto.randomUUID() + ext);
    }
});
const uploadGeneric = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Formato no válido. Solo se permiten archivos de imagen (fotos).'));
        }
    }
}); // NOTA: la lógica original en index.js restringía upload a imágenes, así que mantengo eso.


router.post('/upload-avatar', authenticateToken, uploadAvatar.single('avatar'), uploadController.uploadAvatar);
router.delete('/remove-avatar', authenticateToken, uploadController.removeAvatar);
router.post('/upload-evidence', authenticateToken, uploadEvidence.array('evidencias', 10), uploadController.uploadEvidence);
router.post('/upload', authenticateToken, uploadGeneric.array('files', 5), uploadController.uploadGeneric);

module.exports = router;
