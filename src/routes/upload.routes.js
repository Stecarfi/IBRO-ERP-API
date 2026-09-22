const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { uploadAvatar, uploadEvidence, uploadCourseMaterial, uploadCourseVideo } = require('../middlewares/upload.middleware');
const multer = require('multer');

// Almacenamiento 100% en memoria para streaming directo a Google Drive
const storage = multer.memoryStorage();

const uploadGeneric = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/') || 
            file.mimetype === 'application/pdf' ||
            file.mimetype.includes('document')) {
            cb(null, true);
        } else {
            cb(null, true);
        }
    }
});

router.post('/upload-avatar', authenticateToken, uploadAvatar.single('avatar'), uploadController.uploadAvatar);
router.delete('/remove-avatar', authenticateToken, uploadController.removeAvatar);
router.post('/upload-evidence', authenticateToken, uploadEvidence.array('evidencias', 10), uploadController.uploadEvidence);
router.post('/upload', authenticateToken, uploadGeneric.array('files', 5), uploadController.uploadGeneric);
router.post('/upload-course-material', authenticateToken, uploadCourseMaterial.array('materiales', 10), uploadController.uploadCourseMaterial);
router.post('/upload-course-video', authenticateToken, uploadCourseVideo.single('video'), uploadController.uploadCourseVideo);

module.exports = router;
