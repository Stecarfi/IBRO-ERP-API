const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authenticateToken = (req, res, next) => {
    const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
    
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
                if (dbU) {
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
                    return next();
                }
            } catch (e) {}
        }
        return res.status(401).json({ error: 'Acceso denegado. Sesión no autenticada.' });
    };

    if (!token) {
        return tryFallback();
    }

    jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', async (err, user) => {
        if (err) {
            return tryFallback();
        }
        req.user = user;
        if (user && user.id && (user.esDelegadoGerencia === undefined || user.esComercialCampo === undefined)) {
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
            } catch (e) {
                // Silenciosamente continuar con el user del payload
            }
        }
        next();
    });
};

const optionalAuthenticateToken = (req, res, next) => {
    const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
    if (!token) return next();

    jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', async (err, user) => {
        if (!err && user) {
            req.user = user;
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
