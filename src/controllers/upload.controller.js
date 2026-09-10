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
            
            // 1. Eliminar foto vieja (de Drive o de disco local)
            const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
            if (user && user.foto) {
                if (user.foto.includes('drive.google.com')) {
                    try {
                        await driveService.deleteByUrl(user.foto);
                    } catch (e) {
                        console.error('Error deleting old avatar from Drive:', e);
                    }
                } else {
                    try {
                        const oldFileName = path.basename(user.foto);
                        const oldFilePath = path.join(uploadsDir, oldFileName);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    } catch (e) {
                        console.error('Error deleting old avatar local:', e);
                    }
                }
            }
            
            // 2. Subir nuevo avatar (a Google Drive si está disponible, o a almacenamiento local de respaldo)
            let newUrl = null;
            if (driveService.isAvailable()) {
                try {
                    newUrl = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
                } catch (driveErr) {
                    console.warn('[UPLOAD-AVATAR] Falló Drive, usando respaldo local:', driveErr.message);
                }
            }

            if (!newUrl) {
                const safeName = `${Date.now()}-${req.file.originalname}`;
                const localPath = path.join(uploadsDir, safeName);
                fs.writeFileSync(localPath, req.file.buffer);
                newUrl = `/uploads/${safeName}`;
            }
            
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
            if (user && user.foto) {
                if (user.foto.includes('drive.google.com')) {
                    try {
                        await driveService.deleteByUrl(user.foto);
                    } catch (e) {
                        console.error('Error deleting avatar from Drive:', e);
                    }
                } else {
                    try {
                        const oldFileName = path.basename(user.foto);
                        const oldFilePath = path.join(uploadsDir, oldFileName);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    } catch (e) {
                        console.error('Error deleting avatar local:', e);
                    }
                }
            }
            
            await prisma.user.updateMany({
                where: { user: { equals: username, mode: 'insensitive' } },
                data: { foto: null }
            });
            res.json({ success: true });
        } catch (error) {
            console.error(error);
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
                let driveUrl = null;
                if (driveService.isAvailable()) {
                    try {
                        driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype);
                    } catch (e) {}
                }
                if (!driveUrl) {
                    const safeName = `${Date.now()}-${file.originalname}`;
                    const localPath = path.join(uploadsDir, safeName);
                    fs.writeFileSync(localPath, file.buffer);
                    driveUrl = `/uploads/${safeName}`;
                }
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
                let driveUrl = null;
                if (driveService.isAvailable()) {
                    try {
                        driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype);
                    } catch (e) {}
                }
                if (!driveUrl) {
                    const safeName = `${Date.now()}-${file.originalname}`;
                    const localPath = path.join(uploadsDir, safeName);
                    fs.writeFileSync(localPath, file.buffer);
                    driveUrl = `/uploads/${safeName}`;
                }
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

            const uploadedMaterials = [];
            for (const file of req.files) {
                let fileUrl = null;
                if (driveService.isAvailable()) {
                    try {
                        fileUrl = await driveService.uploadDocument(file.buffer, file.originalname, file.mimetype);
                    } catch (e) {}
                }
                if (!fileUrl) {
                    const safeName = `${Date.now()}-${file.originalname}`;
                    const localPath = path.join(uploadsDir, safeName);
                    fs.writeFileSync(localPath, file.buffer);
                    fileUrl = `/uploads/${safeName}`;
                }
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
            console.error(error);
            res.status(500).json({ error: 'Error uploading course material' });
        }
    }
}

module.exports = new UploadController();
