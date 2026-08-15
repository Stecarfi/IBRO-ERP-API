const prisma = require('../prisma');

class LocationController {
    async updateLocation(req, res) {
        const { user, lat, lng } = req.body;
        if (!user || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Faltan datos de ubicación' });
        }

        try {
            await prisma.user.updateMany({
                where: { user: { equals: user, mode: 'insensitive' } },
                data: {
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    lastLocationUpdate: Date.now().toString() // Cambiado a string si es necesario o numérico según el schema
                }
            });
            // Update the string issue: the original index.js used Date.now(), which is numeric. If schema is Int/BigInt/Float, it's fine.
            res.json({ success: true });
        } catch (error) {
            console.error('Error actualizando ubicación:', error);
            res.status(500).json({ error: 'Error del servidor', details: error.message, stack: error.stack });
        }
    }

    async getUsersLocations(req, res) {
        try {
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    nombre: true,
                    apellido: true,
                    cargo: true,
                    lat: true,
                    lng: true,
                    lastLocationUpdate: true
                },
                where: {
                    lat: { not: null },
                    lng: { not: null }
                }
            });
            res.json(users);
        } catch (error) {
            console.error('Error obteniendo ubicaciones:', error);
            res.status(500).json({ error: 'Error del servidor' });
        }
    }
}

module.exports = new LocationController();
