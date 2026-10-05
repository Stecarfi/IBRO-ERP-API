const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const userLastActivityMap = new Map();

const trackUserLiveActivity = (userId) => {
    if (!userId) return;
    const now = Date.now();
    const last = userLastActivityMap.get(userId) || 0;
    // Throttle: actualizar cada 5 minutos por usuario activo en base de datos
    if (now - last > 5 * 60 * 1000) {
        userLastActivityMap.set(userId, now);
        prisma.user.update({
            where: { id: userId },
            data: { lastLogin: new Date(), isOnline: true }
        }).catch(() => {});
    }
};

const authenticateToken = async (req, res, next) => {
    const bearerToken = req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null;
    const cookieToken = req.cookies?.token || null;
    const candidateTokens = [bearerToken, cookieToken].filter(Boolean);

    let authenticatedUser = null;

    for (const token of candidateTokens) {
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', { clockTolerance: 60 });
            if (user && user.id) {
                authenticatedUser = user;
                break;
            }
        } catch (err) {}
    }

    if (authenticatedUser) {
        req.user = authenticatedUser;
        trackUserLiveActivity(authenticatedUser.id);
        try {
            const dbU = await prisma.user.findUnique({
                where: { id: authenticatedUser.id },
                select: { id: true, user: true, nombre: true, apellido: true, esDelegadoGerencia: true, esComercialCampo: true, cargo: true, roleId: true, role: { select: { id: true, name: true } } }
            });
            if (dbU) {
                req.user.esDelegadoGerencia = Boolean(dbU.esDelegadoGerencia);
                req.user.esComercialCampo = Boolean(dbU.esComercialCampo);
                req.user.cargo = dbU.cargo || req.user.cargo;
                req.user.roleId = dbU.roleId || dbU.role?.id || authenticatedUser.roleId;
                req.user.role = dbU.role;
            }
        } catch (e) {}
        return next();
    }

    const tryFallback = async () => {
        const fallbackUserId = req.headers['x-user-id'];
        const fallbackUsername = req.headers['x-user'];
        if (fallbackUserId || fallbackUsername) {
            try {
                const orConditions = [];
                if (fallbackUserId) orConditions.push({ id: String(fallbackUserId) });
                if (fallbackUsername) orConditions.push({ user: { equals: String(fallbackUsername), mode: 'insensitive' } });
                const dbU = await prisma.user.findFirst({
                    where: { OR: orConditions },
                    include: { role: true }
                });
                if (dbU && !dbU.isLocked) {
                    req.user = {
                        id: dbU.id,
                        user: dbU.user,
                        nombre: dbU.nombre,
                        roleId: dbU.roleId,
                        cargo: dbU.cargo,
                        esComercialCampo: Boolean(dbU.esComercialCampo),
                        esDelegadoGerencia: Boolean(dbU.esDelegadoGerencia),
                        role: dbU.role
                    };
                    trackUserLiveActivity(dbU.id);
                    return next();
                }
            } catch (e) {}
        }
        return res.status(401).json({ error: 'Acceso denegado. Sesión no autenticada o token expirado.', code: 'UNAUTHORIZED' });
    };

    return tryFallback();
};

const optionalAuthenticateToken = (req, res, next) => {
    const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
    if (!token) return next();

    jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', async (err, user) => {
        if (!err && user) {
            req.user = user;
            if (user.id) trackUserLiveActivity(user.id);
            if (user.id && (user.esDelegadoGerencia === undefined || user.esComercialCampo === undefined)) {
                try {
                    const dbU = await prisma.user.findUnique({
                        where: { id: user.id },
                        select: { esDelegadoGerencia: true, esComercialCampo: true, cargo: true, role: { select: { id: true, name: true } } }
                    });
                    if (dbU) {
                        req.user.esDelegadoGerencia = Boolean(dbU.esDelegadoGerencia);
                        req.user.esComercialCampo = Boolean(dbU.esComercialCampo);
                        req.user.cargo = dbU.cargo || req.user.cargo;
                        req.user.role = dbU.role;
                    }
                } catch (e) {}
            }
        }
        next();
    });
};

authenticateToken.optional = optionalAuthenticateToken;
authenticateToken.authenticateToken = authenticateToken;
authenticateToken.optionalAuthenticateToken = optionalAuthenticateToken;

module.exports = authenticateToken;
