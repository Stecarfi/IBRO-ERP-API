const prisma = require('../prisma');
const driveService = require('../services/drive.service');

class UploadController {
    async uploadAvatar(req, res) {
        try {
            const username = req.body.username || req.user?.user;
            if (!username) return res.status(400).json({ error: 'Username required' });
            if (!req.file) return res.status(400).json({ error: 'No avatar file provided' });
            
            if (!driveService.isAvailable()) {
                return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para almacenar avatares.' });
            }

            // 1. Eliminar foto vieja si estaba en Drive
            const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
            if (user && user.foto && user.foto.includes('drive.google.com')) {
                try {
                    await driveService.deleteByUrl(user.foto);
                } catch (e) {
                    console.error('Error deleting old avatar from Drive:', e);
                }
            }
            
            // 2. Subir nuevo avatar directamente a Drive en Usuarios/user_{id}
            const userFolder = `user_${user?.id || username}`;
            const newUrl = await driveService.uploadFile(
                req.file.buffer, 
                req.file.originalname, 
                req.file.mimetype,
                ['Usuarios', userFolder]
            );
            
            await prisma.user.updateMany({
                where: { user: { equals: username, mode: 'insensitive' } },
                data: { foto: newUrl }
            });
            
            res.json({ url: newUrl });
        } catch (error) {
            console.error('[UPLOAD-CONTROLLER] Error:', error);
            res.status(500).json({ error: error.message || 'Error uploading avatar to Google Drive' });
        }
    }

    async removeAvatar(req, res) {
        try {
            const username = req.body.username || req.user?.user;
            if (!username) return res.status(400).json({ error: 'Username required' });
            
            const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
            if (user && user.foto && user.foto.includes('drive.google.com')) {
                try {
                    await driveService.deleteByUrl(user.foto);
                } catch (e) {
                    console.error('Error deleting avatar from Drive:', e);
                }
            }
            
            await prisma.user.updateMany({
                where: { user: { equals: username, mode: 'insensitive' } },
                data: { foto: null }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('[REMOVE-AVATAR-CONTROLLER] Error:', error);
            res.status(500).json({ error: 'Error removing avatar' });
        }
    }

    async uploadEvidence(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            if (!driveService.isAvailable()) {
                return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para almacenar evidencias.' });
            }

            const rawModule = req.body.modulo || req.body.module || 'Servicios';
            const moduleFolder = rawModule.charAt(0).toUpperCase() + rawModule.slice(1).toLowerCase();
            const caseId = req.body.serviceId || req.body.servicioId || req.body.pqrsId || req.body.id || 'general';
            const folderSegments = [moduleFolder, `caso_${caseId}`];

            const urls = [];
            for (const file of req.files) {
                const driveUrl = await driveService.uploadFile(
                    file.buffer, 
                    file.originalname, 
                    file.mimetype,
                    folderSegments
                );
                urls.push(driveUrl);
            }

            res.json({ urls });
        } catch (error) {
            console.error('[UPLOAD-EVIDENCE-CONTROLLER] Error:', error);
            res.status(500).json({ error: error.message || 'Error uploading evidence to Google Drive' });
        }
    }

    async uploadGeneric(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            if (!driveService.isAvailable()) {
                return res.status(503).json({ error: 'El servicio de Google Drive no está disponible.' });
            }

            const targetFolder = req.body.folder || 'General';
            const folderSegments = [targetFolder];

            const uploadedFiles = [];
            for (const file of req.files) {
                const driveUrl = await driveService.uploadFile(
                    file.buffer, 
                    file.originalname, 
                    file.mimetype, 
                    folderSegments
                );
                uploadedFiles.push({
                    name: file.originalname,
                    type: file.mimetype,
                    size: file.size,
                    url: driveUrl
                });
            }

            res.json({ success: true, files: uploadedFiles });
        } catch (error) {
            console.error('[UPLOAD-GENERIC-CONTROLLER] Error:', error);
            res.status(500).json({ error: error.message || 'Error uploading files to Google Drive' });
        }
    }

    async uploadCourseMaterial(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            if (!driveService.isAvailable()) {
                return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para materiales de capacitación.' });
            }

            const courseId = req.body.courseId || req.body.cursoId || 'general';
            const folderSegments = ['Capacitaciones', `curso_${courseId}`];

            const uploadedMaterials = [];
            for (const file of req.files) {
                const fileUrl = await driveService.uploadDocument(
                    file.buffer, 
                    file.originalname, 
                    file.mimetype,
                    folderSegments
                );

                uploadedMaterials.push({
                    nombre: file.originalname,
                    url: fileUrl,
                    tamano: file.size,
                    mimetype: file.mimetype
                });
            }

            res.json({ 
                success: true, 
                materials: uploadedMaterials, 
                urls: uploadedMaterials.map(m => m.url) 
            });
        } catch (error) {
            console.error('[UPLOAD-COURSE-CONTROLLER] Error:', error);
            res.status(500).json({ error: error.message || 'Error uploading course material to Google Drive' });
        }
    }

    async uploadCourseVideo(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No se envió ningún archivo de video.' });
            }

            if (!driveService.isAvailable()) {
                return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para almacenar videos.' });
            }

            const courseId = req.body.courseId || req.body.cursoId || 'general';
            const folderSegments = ['Capacitaciones', `curso_${courseId}`, 'Videos'];

            const fileResult = await driveService.uploadVideoFile(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype || 'video/mp4',
                folderSegments
            );

            res.json({
                success: true,
                fileId: fileResult.fileId,
                fileName: req.file.originalname,
                url: `/api/drive-stream/${fileResult.fileId}`,
                driveUrl: fileResult.webViewLink || `https://drive.google.com/file/d/${fileResult.fileId}/view`,
                size: req.file.size,
                mimetype: req.file.mimetype || 'video/mp4'
            });
        } catch (error) {
            console.error('[UPLOAD-COURSE-VIDEO] Error:', error);
            res.status(500).json({ error: error.message || 'Error al subir el video a Google Drive' });
        }
    }
}

module.exports = new UploadController();
