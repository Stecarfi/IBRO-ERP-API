const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.memoryStorage(); // Cambiado a memory storage para subir directo a Drive

const uploadAvatar = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Formato no válido. Solo se permiten archivos de imagen (fotos).'));
        }
    }
});

const uploadEvidence = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/') || 
            file.mimetype === 'application/pdf' ||
            file.mimetype.includes('document')) {
            cb(null, true);
        } else {
            cb(new Error('Formato no válido. Solo imágenes y documentos PDF/Word.'));
        }
    }
});

const uploadCourseMaterial = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Relajar el filtro para aceptar pdf, powerpoint, word, etc.
        if (file.mimetype.includes('pdf') ||
            file.mimetype.includes('powerpoint') ||
            file.mimetype.includes('presentation') ||
            file.mimetype.includes('document') ||
            file.mimetype.includes('msword') ||
            file.mimetype.includes('application/')) {
            cb(null, true);
        } else {
            cb(null, true); // Por defecto aceptamos para evitar bloqueos por mimetypes raros
        }
    }
});

const uploadCourseVideo = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // Hasta 500 MB por video formativo
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('video/') ||
            file.originalname.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)) {
            cb(null, true);
        } else {
            cb(null, true);
        }
    }
});

module.exports = {
    uploadAvatar,
    uploadEvidence,
    uploadCourseMaterial,
    uploadCourseVideo,
    uploadsDir
};

