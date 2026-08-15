const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const { uploadsDir } = require('../middlewares/upload.middleware');

class UploadController {
    async uploadAvatar(req, res) {
        try {
            const username = req.body.username;
            if (!username) return res.status(400).json({ error: 'Username required' });
            
            // Eliminar foto vieja
            const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
            if (user && user.foto) {
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
            
            const isProd = req.get('host').includes('onrender.com');
            const protocol = isProd ? 'https' : req.protocol;
            const newUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
            
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
            const isProd = req.get('host').includes('onrender.com');
            const protocol = isProd ? 'https' : req.protocol;
            
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const urls = req.files.map(file => `${protocol}://${req.get('host')}/uploads/${file.filename}`);
            res.json({ urls });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error uploading evidence' });
        }
    }

    async uploadGeneric(req, res) {
        try {
            const uploadedFiles = req.files.map(file => {
                const isProd = req.get('host').includes('onrender.com');
                const protocol = isProd ? 'https' : req.protocol;
                return {
                    name: file.originalname,
                    type: file.mimetype,
                    size: file.size,
                    url: `${protocol}://${req.get('host')}/uploads/${file.filename}`
                };
            });
            res.json({ success: true, files: uploadedFiles });
        } catch (error) {
            console.error('Error uploading generic files:', error);
            res.status(500).json({ error: error.message || 'Error uploading files' });
        }
    }
}

module.exports = new UploadController();
