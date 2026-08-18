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
        if (file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/vnd.ms-powerpoint' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
            cb(null, true);
        } else {
            cb(new Error('Formato no válido. Solo se permiten archivos PDF y PowerPoint.'));
        }
    }
});

module.exports = {
    uploadAvatar,
    uploadEvidence,
    uploadCourseMaterial,
    uploadsDir
};
