const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
    if (!token) return res.status(401).json({ error: 'Acceso denegado. No hay token proporcionado.' });

    jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', (err, user) => {
        if (err) return res.status(403).json({ error: 'Token expirado o inválido.' });
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;
