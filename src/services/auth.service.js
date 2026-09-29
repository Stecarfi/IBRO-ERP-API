const prisma = require('../prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendResetEmail } = require('../emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'ibro_fallback_secret_2026';

class AuthService {
    async login(user, pass) {
        let dbUser = await prisma.user.findFirst({
            where: { user: { equals: user, mode: 'insensitive' } }
        });

        if (!dbUser) {
            throw new Error('USER_NOT_FOUND');
        }

        if (dbUser.isLocked) {
            throw new Error('USER_LOCKED');
        }

        let matches = false;
        const isBcrypt = dbUser.pass.startsWith('$2a$') || dbUser.pass.startsWith('$2b$') || dbUser.pass.startsWith('$2y$');
        if (isBcrypt) {
            matches = bcrypt.compareSync(pass, dbUser.pass);
        } else {
            matches = (pass === dbUser.pass);
            if (matches) {
                await prisma.user.update({
                    where: { id: dbUser.id },
                    data: { pass: bcrypt.hashSync(pass, 10) }
                });
            }
        }

        if (!matches) {
            const newAttempts = (dbUser.failedLoginAttempts || 0) + 1;
            if (newAttempts >= 3) {
                await prisma.user.update({
                    where: { id: dbUser.id },
                    data: { failedLoginAttempts: newAttempts, isLocked: true }
                });
                throw new Error('ACCOUNT_LOCKED_MAX_ATTEMPTS');
            } else {
                await prisma.user.update({
                    where: { id: dbUser.id },
                    data: { failedLoginAttempts: newAttempts }
                });
                throw new Error(`INVALID_PASSWORD:${newAttempts}`);
            }
        }

        if (dbUser.failedLoginAttempts > 0) {
            await prisma.user.update({
                where: { id: dbUser.id },
                data: { failedLoginAttempts: 0 }
            });
        }

        const tokenPayload = {
            id: dbUser.id,
            user: dbUser.user,
            roleId: dbUser.roleId,
            cargo: dbUser.cargo || '',
            esComercialCampo: Boolean(dbUser.esComercialCampo),
            esDelegadoGerencia: Boolean(dbUser.esDelegadoGerencia)
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

        const refreshToken = jwt.sign(
            { id: dbUser.id, user: dbUser.user },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        let activeTokens = [];
        try {
            if (dbUser.refreshToken) {
                activeTokens = JSON.parse(dbUser.refreshToken);
                if (!Array.isArray(activeTokens)) activeTokens = [dbUser.refreshToken];
            }
        } catch (e) {
            activeTokens = dbUser.refreshToken ? [dbUser.refreshToken] : [];
        }
        activeTokens = activeTokens.filter(t => {
            try {
                jwt.verify(t, JWT_SECRET);
                return true;
            } catch {
                return false;
            }
        });
        activeTokens.unshift(refreshToken);
        activeTokens = activeTokens.slice(0, 10);

        const nowIso = new Date().toISOString();
        const updatedUser = await prisma.user.update({
            where: { id: dbUser.id },
            data: { 
                refreshToken: JSON.stringify(activeTokens),
                lastLogin: nowIso,
                isOnline: true
            }
        });

        await prisma.auditoria.create({
            data: {
                userId: dbUser.id,
                fecha: new Date(),
                action: 'LOGIN',
                modulo: 'Autenticación',
                recordDetails: 'Inicio de sesión exitoso'
            }
        }).catch(() => {});

        return { token, refreshToken, user: updatedUser };
    }

    async logout(refreshToken) {
        if (!refreshToken) return;
        try {
            const decoded = jwt.verify(refreshToken, JWT_SECRET, { clockTolerance: 60 });
            const dbUser = await prisma.user.findUnique({ where: { id: decoded.id } });
            if (dbUser) {
                let activeTokens = [];
                try {
                    activeTokens = JSON.parse(dbUser.refreshToken || '[]');
                    if (!Array.isArray(activeTokens)) activeTokens = [dbUser.refreshToken];
                } catch {
                    activeTokens = dbUser.refreshToken ? [dbUser.refreshToken] : [];
                }
                activeTokens = activeTokens.filter(t => t !== refreshToken);
                await prisma.user.update({
                    where: { id: decoded.id },
                    data: { 
                        refreshToken: activeTokens.length > 0 ? JSON.stringify(activeTokens) : null,
                        isOnline: activeTokens.length > 0
                    }
                });
            }
        } catch (e) {
            // Ignorar si el token ya expiró o es inválido
        }
    }

    async refreshSession(refreshToken) {
        const decoded = jwt.verify(refreshToken, JWT_SECRET, { clockTolerance: 60 });
        const dbUser = await prisma.user.findUnique({ where: { id: decoded.id } });
        
        if (!dbUser || dbUser.isLocked) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        let activeTokens = [];
        let isValidSession = false;
        try {
            if (dbUser.refreshToken) {
                activeTokens = JSON.parse(dbUser.refreshToken);
                if (Array.isArray(activeTokens)) {
                    isValidSession = activeTokens.includes(refreshToken);
                } else {
                    isValidSession = (dbUser.refreshToken === refreshToken);
                    activeTokens = [dbUser.refreshToken];
                }
            }
        } catch {
            isValidSession = (dbUser.refreshToken === refreshToken);
            activeTokens = dbUser.refreshToken ? [dbUser.refreshToken] : [];
        }

        if (!isValidSession && dbUser.refreshToken === null) {
            throw new Error('REVOKED_REFRESH_TOKEN');
        }

        const tokenPayload = {
            id: dbUser.id,
            user: dbUser.user,
            roleId: dbUser.roleId,
            cargo: dbUser.cargo || '',
            esComercialCampo: Boolean(dbUser.esComercialCampo),
            esDelegadoGerencia: Boolean(dbUser.esDelegadoGerencia)
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

        return token;
    }

    async recoverPassword(user, origin) {
        const dbUser = await prisma.user.findFirst({
            where: { user: { equals: user, mode: 'insensitive' } }
        });

        if (!dbUser || !dbUser.correo) {
            throw new Error('NO_EMAIL');
        }

        const resetToken = jwt.sign({ id: dbUser.id }, JWT_SECRET, { expiresIn: '15m' });
        const resetLink = `${origin}/login?resetToken=${resetToken}&resetUser=${encodeURIComponent(dbUser.user)}`;
        
        await sendResetEmail(dbUser.correo, resetLink);
        return dbUser.correo;
    }

    async resetPassword(user, token, newPassword) {
        const decoded = jwt.verify(token, JWT_SECRET);
        const dbUser = await prisma.user.findFirst({
            where: { user: { equals: user, mode: 'insensitive' }, id: decoded.id }
        });

        if (!dbUser) {
            throw new Error('USER_MISMATCH');
        }

        const hashed = bcrypt.hashSync(newPassword, 10);
        await prisma.user.update({
            where: { id: dbUser.id },
            data: { pass: hashed, isLocked: false, failedLoginAttempts: 0 }
        });
    }

    async emergencyUnlock(user) {
        await prisma.user.updateMany({
            where: { user: { equals: user, mode: 'insensitive' } },
            data: { isLocked: false, failedLoginAttempts: 0 }
        });
    }
}

module.exports = new AuthService();
