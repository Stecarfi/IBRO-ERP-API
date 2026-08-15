const syncService = require('../services/sync.service');
const { validateSyncPayload } = require('../validators');
const { broadcastUpdate } = require('../utils/socket');
const prisma = require('../prisma');

class SyncController {
    async getDb(req, res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        try {
            const data = await syncService.getDb();
            res.json(data);
        } catch (error) {
            console.error('Error fetching full DB:', error);
            res.status(500).json({ error: 'Server error fetching DB' });
        }
    }

    async sync(req, res) {
        const { diff, user } = req.body;
        if (!diff) {
            return res.status(400).json({ error: 'No diff payload provided' });
        }

        try {
            validateSyncPayload(diff);
        } catch (validationError) {
            console.error('Zod Validation Blocked Request:', validationError.message);
            return res.status(400).json({ error: validationError.message });
        }

        try {
            await syncService.sync(diff, user);
            
            if (diff.chat) {
                broadcastUpdate('CHAT_UPDATE');
            } else {
                broadcastUpdate('DB_UPDATE');
            }

            res.json({ success: true, timestamp: Date.now() });
        } catch (error) {
            console.error('Transaction Error:', error);
            res.status(500).json({ error: error.message || 'Transaction failed' });
        }
    }

    async updateInformesConfig(req, res) {
        try {
            const data = req.body;
            const existing = await prisma.informesConfig.findUnique({ where: { id: 1 } });
            
            if (existing) {
                await prisma.informesConfig.update({ where: { id: 1 }, data });
            } else {
                await prisma.informesConfig.create({ data: { id: 1, ...data } });
            }
            res.json({ success: true });
        } catch (error) {
            console.error('Error saving informes config:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }
}

module.exports = new SyncController();