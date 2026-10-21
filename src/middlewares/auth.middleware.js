const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { JWT_SECRET } = require('../config/jwtSecret');

// Nota de Auditoría: Se eliminó la simulación automática de presencia en backend (trackUserLiveActivity).
// La única fuente oficial de presencia es el frontend mediante eventos reales y heartbeat auditable.

const authenticateToken = async (req, res, next) => {
    const bearerToken = req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null;
    const cookieToken = req.cookies?.token || null;
    const candidateTokens = [bearerToken, cookieToken].filter(Boolean);

    let authenticatedUser = null;

    for (const token of candidateTokens) {
        try {
            const user = jwt.verify(token, JWT_SECRET, { clockTolerance: 60 });
            if (user && user.id) {
                authenticatedUser = user;
                break;
            }
        } catch (err) {}
    }

    if (authenticatedUser) {
        req.user = authenticatedUser;
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

    // Fase 0 (seguridad): se eliminó el fallback por cabeceras 'x-user-id' / 'x-user'.
    // Permitía autenticarse como cualquier usuario sin token. Solo se acepta un JWT válido.
    return res.status(401).json({ error: 'Acceso denegado. Sesión no autenticada o token expirado.', code: 'UNAUTHORIZED' });
};

const optionalAuthenticateToken = (req, res, next) => {
    const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
    if (!token) return next();

    jwt.verify(token, JWT_SECRET, async (err, user) => {
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
