const prisma = require('../prisma');

class LocationController {
    async updateLocation(req, res) {
        const user = req.body.user || req.user?.user;
        const { lat, lng } = req.body;
        if (!user || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Faltan datos de ubicación' });
        }

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        if (isNaN(parsedLat) || isNaN(parsedLng)) {
            return res.status(400).json({ error: 'Coordenadas numéricas inválidas' });
        }

        try {
                const now = Date.now();
                await prisma.user.updateMany({
                    where: { user: { equals: user, mode: 'insensitive' } },
                    data: {
                        lat: parsedLat,
                        lng: parsedLng,
                        lastLocationUpdate: now // Float/BigInt numérico
                    }
                });
                const io = req.app?.get('io');
                if (io) {
                    io.emit('LOCATION_UPDATE', {
                        user,
                        lat: parsedLat,
                        lng: parsedLng,
                        lastLocationUpdate: now
                    });
                }
                res.json({ success: true, lat: parsedLat, lng: parsedLng });
        } catch (error) {
            console.error('Error actualizando ubicación:', error);
            res.status(500).json({ error: 'Error del servidor', details: error.message });
        }
    }

    async getUsersLocations(req, res) {
        try {
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    nombre: true,
                    apellido: true,
                    user: true,
                    roleId: true,
                    cargo: true,
                    foto: true,
                    lat: true,
                    lng: true,
                    lastLocationUpdate: true
                },
                where: {
                    lat: { not: null },
                    lng: { not: null }
                }
            });
            const mappedUsers = users.map(u => ({
                ...u,
                username: u.user
            }));
            res.json(mappedUsers);
        } catch (error) {
            console.error('Error obteniendo ubicaciones:', error);
            res.status(500).json({ error: 'Error del servidor' });
        }
    }
}

module.exports = new LocationController();
