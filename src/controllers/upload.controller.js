const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const { uploadsDir } = require('../middlewares/upload.middleware');
const driveService = require('../services/drive.service');

class UploadController {
    async uploadAvatar(req, res) {
        try {
            const username = req.body.username;
            if (!username) return res.status(400).json({ error: 'Username required' });
            if (!req.file) return res.status(400).json({ error: 'No avatar file provided' });
            
            // Eliminar foto vieja (si era un archivo local heredado)
            const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
            if (user && user.foto && !user.foto.includes('drive.google.com')) {
                try {
                    const oldFileName = path.basename(user.foto);
                    const oldFilePath = path.join(uploadsDir, oldFileName);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                } catch (e) {
                    console.error('Error deleting old avatar:', e);
                }
            }
            
            // Subir a Google Drive
            const newUrl = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
            
            await prisma.user.updateMany({
                where: { user: { equals: username, mode: 'insensitive' } },
                data: { foto: newUrl }
            });
            
            res.json({ url: newUrl });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error uploading avatar' });
        }
    }

    async removeAvatar(req, res) {
        try {
            const username = req.body.username;
            if (!username) return res.status(400).json({ error: 'Username required' });
            
            const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
            if (user && user.foto && !user.foto.includes('drive.google.com')) {
                try {
                    const oldFileName = path.basename(user.foto);
                    const oldFilePath = path.join(uploadsDir, oldFileName);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                } catch (e) {
                    console.error('Error deleting avatar:', e);
                }
            }
            
            await prisma.user.updateMany({
                where: { user: { equals: username, mode: 'insensitive' } },
                data: { foto: null }
            });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Error removing avatar' });
        }
    }

    async uploadEvidence(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const urls = [];
            for (const file of req.files) {
                const driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype);
                urls.push(driveUrl);
            }

            res.json({ urls });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error uploading evidence' });
        }
    }

    async uploadGeneric(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const uploadedFiles = [];
            for (const file of req.files) {
                const driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype);
                uploadedFiles.push({
                    name: file.originalname,
                    type: file.mimetype,
                    size: file.size,
                    url: driveUrl
                });
            }

            res.json({ success: true, files: uploadedFiles });
        } catch (error) {
            console.error('Error uploading generic files:', error);
            res.status(500).json({ error: error.message || 'Error uploading files' });
        }
    }

    async uploadCourseMaterial(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const urls = [];
            for (const file of req.files) {
                const driveUrl = await driveService.uploadDocument(file.buffer, file.originalname, file.mimetype);
                urls.push(driveUrl);
            }

            res.json({ urls });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error uploading course material' });
        }
    }
}

module.exports = new UploadController();
