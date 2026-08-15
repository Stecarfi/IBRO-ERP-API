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

        const token = jwt.sign(
            { id: dbUser.id, user: dbUser.user, roleId: dbUser.roleId },
            JWT_SECRET,
            { expiresIn: '15m' }
        );

        const refreshToken = jwt.sign(
            { id: dbUser.id, user: dbUser.user },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const nowIso = new Date().toISOString();
        const updatedUser = await prisma.user.update({
            where: { id: dbUser.id },
            data: { 
                refreshToken,
                lastLogin: nowIso,
                isOnline: true
            }
        });

        await prisma.auditoria.create({
            data: {
                user: dbUser.user,
                fecha: nowIso,
                action: 'LOGIN',
                modulo: 'Autenticación',
                recordDetails: 'Inicio de sesión exitoso'
            }
        });

        return { token, refreshToken, user: updatedUser };
    }

    async logout(refreshToken) {
        if (!refreshToken) return;
        try {
            const decoded = jwt.verify(refreshToken, JWT_SECRET);
            await prisma.user.update({
                where: { id: decoded.id },
                data: { refreshToken: null }
            });
        } catch (e) {
            // Ignorar si el token ya expiró o es inválido
        }
    }

    async refreshSession(refreshToken) {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        const dbUser = await prisma.user.findUnique({ where: { id: decoded.id } });
        
        if (!dbUser || dbUser.refreshToken !== refreshToken) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const token = jwt.sign(
            { id: dbUser.id, user: dbUser.user, roleId: dbUser.roleId },
            JWT_SECRET,
            { expiresIn: '15m' }
        );

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
