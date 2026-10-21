const prisma = require('../prisma');

class LocationController {
    async updateLocation(req, res) {
        const user = req.body.user || req.user?.user;
        const targetId = req.body.id || req.user?.id;
        const { lat, lng, bateria, velocidad } = req.body;
        if ((!user && !targetId) || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Faltan datos de ubicación' });
        }

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        if (isNaN(parsedLat) || isNaN(parsedLng)) {
            return res.status(400).json({ error: 'Coordenadas numéricas inválidas' });
        }

        try {
            const now = Date.now();
            const whereOr = [];
            if (targetId) whereOr.push({ id: String(targetId) });
            if (user) whereOr.push({ user: { equals: String(user), mode: 'insensitive' } });

            await prisma.user.updateMany({
                where: { OR: whereOr },
                data: {
                    isOnline: true,
                    lat: parsedLat,
                    lng: parsedLng,
                    lastLocationUpdate: now
                }
            });
            const io = req.app?.get('io');
            if (io) {
                const payload = {
                    id: targetId,
                    usuarioId: targetId,
                    user,
                    lat: parsedLat,
                    lng: parsedLng,
                    bateria: bateria != null ? Number(bateria) : null,
                    velocidad: velocidad != null ? Number(velocidad) : 0,
                    isOnline: true,
                    enVivo: true,
                    lastLocationUpdate: now
                };
                io.emit('LOCATION_UPDATE', payload);
                io.emit('CAMPO_TELEMETRIA_UPDATE', payload);
            }
            res.json({ success: true, lat: parsedLat, lng: parsedLng, lastLocationUpdate: now });
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
                    lastLocationUpdate: true,
                    esComercialCampo: true,
                    esDelegadoGerencia: true
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
