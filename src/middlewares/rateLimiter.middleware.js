const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5000, // límite amplio para telemetría y operaciones concurrentes
    skip: (req) => req.method === 'OPTIONS',
    message: { error: 'Demasiadas peticiones detectadas (Anti-DDoS). Intente más tarde.' }
});

const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 10, // máximo 10 intentos
    message: { error: 'Demasiados intentos de inicio de sesión. Espere 5 minutos.' }
});

module.exports = {
    apiLimiter,
    loginLimiter
};
