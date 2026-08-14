const { z } = require('zod');
const authService = require('../services/auth.service');
const { broadcastUpdate } = require('../utils/socket');

class AuthController {
    async login(req, res) {
        const loginSchema = z.object({
            user: z.string().min(1, 'El usuario no puede estar vacío').max(100, 'Usuario muy largo'),
            pass: z.string().min(1, 'La contraseña no puede estar vacía').max(200, 'Contraseña muy larga')
        });

        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            console.log(`[LOGIN FAILED] Validación Zod fallida:`, parsed.error.issues);
            return res.status(400).json({ error: 'Formato de credenciales inválido (Protección de Inyección)' });
        }

        const { user, pass } = parsed.data;
        console.log(`[LOGIN ATTEMPT] User: "${user}"`);

        try {
            const { token, refreshToken, user: dbUser } = await authService.login(user, pass);
            
            // Update clients
            broadcastUpdate('DB_UPDATE');

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 15 * 60 * 1000 // 15 min
            });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
            });

            return res.json({ success: true, user: dbUser, token, refreshToken });
        } catch (error) {
            if (error.message === 'USER_NOT_FOUND') {
                return res.status(401).json({ error: 'Usuario no encontrado' });
            }
            if (error.message === 'USER_LOCKED') {
                console.log(`\n======================================================`);
                console.log(`[ALERTA] Usuario ya está bloqueado: ${user}`);
                console.log(`URL PARA DESBLOQUEAR INMEDIATAMENTE:`);
                console.log(`https://ibro-api.onrender.com/api/emergency-unlock/${encodeURIComponent(user)}`);
                console.log(`======================================================\n`);
                return res.status(403).json({ error: 'Cuenta bloqueada por seguridad. Revisa tu correo electrónico para desbloquearla.' });
            }
            if (error.message === 'ACCOUNT_LOCKED_MAX_ATTEMPTS') {
                return res.status(403).json({ error: 'Cuenta bloqueada por demasiados intentos fallidos. Revisa tu correo.' });
            }
            if (error.message.startsWith('INVALID_PASSWORD')) {
                const attempts = error.message.split(':')[1];
                return res.status(401).json({ error: `Contraseña incorrecta. Intento ${attempts} de 3.` });
            }
            
            console.error('Login error:', error);
            res.status(500).json({ error: 'Error interno en el servidor de autenticación' });
        }
    }

    async logout(req, res) {
        const refreshToken = req.cookies?.refreshToken;
        await authService.logout(refreshToken);

        const cookieOpts = { httpOnly: true, secure: true, sameSite: 'none' };
        res.clearCookie('token', cookieOpts);
        res.clearCookie('refreshToken', cookieOpts);
        res.json({ success: true });
    }

    async refresh(req, res) {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) return res.status(401).json({ error: 'No refresh token provided' });

        try {
            const token = await authService.refreshSession(refreshToken);
            
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 15 * 60 * 1000
            });

            res.json({ success: true, token });
        } catch (error) {
            console.error('Refresh token error:', error);
            const cookieOpts = { httpOnly: true, secure: true, sameSite: 'none' };
            res.clearCookie('token', cookieOpts);
            res.clearCookie('refreshToken', cookieOpts);
            res.status(403).json({ error: 'Refresh token expired or invalid' });
        }
    }

    async recoverPassword(req, res) {
        const { user, origin } = req.body;
        if (!user) {
            return res.status(400).json({ error: 'Usuario requerido' });
        }

        try {
            const correo = await authService.recoverPassword(user, origin || req.headers.origin);
            
            // Mask email
            const [local, domain] = correo.split('@');
            const maskedEmail = `${local.substring(0, 3)}***@${domain}`;
            
            res.json({ success: true, message: `Correo de recuperación enviado a ${maskedEmail}` });
        } catch (error) {
            console.error('Recover password error:', error);
            if (error.message === 'NO_EMAIL') {
                return res.status(400).json({ error: 'El usuario no tiene un correo válido configurado.' });
            }
            res.status(500).json({ error: 'Error interno al procesar recuperación' });
        }
    }

    async resetPassword(req, res) {
        const { user, token, newPassword } = req.body;
        if (!user || !token || !newPassword) {
            return res.status(400).json({ error: 'Faltan parámetros' });
        }

        try {
            await authService.resetPassword(user, token, newPassword);
            res.json({ success: true, message: 'Contraseña actualizada correctamente' });
        } catch (error) {
            console.error('Reset password error:', error);
            res.status(400).json({ error: 'Enlace expirado, inválido, o datos incorrectos.' });
        }
    }

    async emergencyUnlock(req, res) {
        try {
            const { user } = req.params;
            await authService.emergencyUnlock(user);
            res.send(`<h1>Cuenta de ${user} desbloqueada con éxito!</h1><p>Ya puedes intentar iniciar sesión de nuevo.</p>`);
        } catch (error) {
            res.status(500).send(`Error al desbloquear: ${error.message}`);
        }
    }
}

module.exports = new AuthController();
