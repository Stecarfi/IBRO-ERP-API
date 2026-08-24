require('dotenv').config();
const prisma = require('./prisma');
const nodemailer = require('nodemailer');
const express = require('express');
const { initCronJobs } = require('./cron.service');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { z } = require('zod');
const { validateSyncPayload } = require('./validators');
const { askGemini, geminiLogs } = require('./geminiService');
const { sendRecoveryEmail, verifySmtpConnection, sendLockoutEmail } = require('./emailService');
const driveService = require('./services/drive.service');

const path = require('path');
const app = express();
app.set('trust proxy', 1); // Solución para error de express-rate-limit en Render (X-Forwarded-For)
app.use(cookieParser());
const rateLimit = require('express-rate-limit');
const { setupCronJobs } = require('./cron/backup');

// Iniciar tareas en segundo plano
setupCronJobs();

// Middleware de Autenticación
const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
  
  // LOGS DE DIAGNÓSTICO TEMPORAL
  console.log("AUTH HEADER:", req.headers['authorization'] || 'N/A');
  console.log("TOKEN:", token || 'N/A');

  if (!token) {
    console.error(`[AUTH ERROR] No token provided. Request to: ${req.originalUrl}. Headers auth: ${req.headers['authorization']}, Cookies: ${JSON.stringify(req.cookies)}`);
    return res.status(401).json({ error: 'Acceso denegado. No hay token proporcionado.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', (err, user) => {
    if (err) {
      console.error(`[AUTH ERROR] Invalid token: ${err.message}`);
      // Se cambia 403 a 401 para expiración de sesión, para que el frontend maneje mejor el refresh
      return res.status(401).json({ error: 'Token expirado o inválido.' });
    }
    req.user = user;
    console.log("USER:", req.user);
    next();
  });
};

// 🔒 CORS
app.use(cors({
    origin: function(origin, callback) {
        callback(null, true);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// 🛡️ Rate Limiting Global (Anti-DDoS)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // límite de 500 peticiones por IP
  message: { error: 'Demasiadas peticiones detectadas (Anti-DDoS). Intente más tarde.' }
});
app.use('/api/', apiLimiter);

// 🛡️ Rate Limiting Estricto para Login (Anti-Fuerza Bruta)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // máximo 10 intentos
  message: { error: 'Demasiados intentos de inicio de sesión. Espere 5 minutos.' }
});
// Incrementar límite de tamaño para soportar imágenes en Base64 en solicitudes/PQRS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuración de almacenamiento de avatares (Subida de fotos)
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.memoryStorage(); // Cambiado a memory storage para subir a Google Drive
const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Formato no válido. Solo se permiten archivos de imagen (fotos).'));
        }
    }
});

app.post('/api/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const username = req.body.username;
        if (!username) return res.status(400).json({ error: 'Username required' });
        if (!req.file) return res.status(400).json({ error: 'No avatar file provided' });
        
        // Eliminar foto vieja de la memoria/disco (solo si es un archivo local heredado)
        const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
        if (user && user.foto && !user.foto.includes('drive.google.com')) {
            try {
                const oldFileName = path.basename(user.foto);
                const oldFilePath = path.join(uploadsDir, oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            } catch (e) {
                console.error('Error deleting old avatar:', e);
            }
        }
        
        // Subir buffer a Google Drive
        const newUrl = await driveService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        
        // Guardar URL real en la base de datos
        await prisma.user.updateMany({
            where: { user: { equals: username, mode: 'insensitive' } },
            data: { foto: newUrl }
        });
        
        res.json({ url: newUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error uploading avatar' });
    }
});

const uploadEvidence = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Permitir imágenes y documentos pdf/word
        if (file.mimetype.startsWith('image/') || 
            file.mimetype === 'application/pdf' ||
            file.mimetype.includes('document')) {
            cb(null, true);
        } else {
            cb(new Error('Formato no válido. Solo imágenes y documentos PDF/Word.'));
        }
    }
});

app.post('/api/upload-evidence', authenticateToken, uploadEvidence.array('evidencias', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const urls = [];
        for (const file of req.files) {
            const driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype);
            urls.push(driveUrl);
        }

        res.json({ urls });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error uploading evidence' });
    }
});

app.delete('/api/remove-avatar', authenticateToken, async (req, res) => {
    try {
        const username = req.body.username;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
        if (user && user.foto && !user.foto.includes('drive.google.com')) {
            try {
                const oldFileName = path.basename(user.foto);
                const oldFilePath = path.join(uploadsDir, oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            } catch (e) {
                console.error('Error deleting avatar:', e);
            }
        }
        
        await prisma.user.updateMany({
            where: { user: { equals: username, mode: 'insensitive' } },
            data: { foto: null }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error removing avatar' });
    }
});

// Endpoint genérico de subida de archivos (Evidencias de PQRS, Solicitudes, etc.)
app.post('/api/upload', authenticateToken, upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedFiles = [];
        for (const file of req.files) {
            const driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype);
            uploadedFiles.push({
                name: file.originalname,
                type: file.mimetype,
                size: file.size,
                url: driveUrl
            });
        }
        res.json({ success: true, files: uploadedFiles });
    } catch (error) {
        console.error('Error uploading generic files:', error);
        res.status(500).json({ error: error.message || 'Error uploading files' });
    }
});

const uploadCourseMaterial = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.includes('pdf') ||
            file.mimetype.includes('powerpoint') ||
            file.mimetype.includes('presentation') ||
            file.mimetype.includes('document') ||
            file.mimetype.includes('msword') ||
            file.mimetype.includes('application/')) {
            cb(null, true);
        } else {
            cb(null, true); 
        }
    }
});

app.post('/api/upload-course-material', authenticateToken, uploadCourseMaterial.array('materiales', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const urls = [];
        for (const file of req.files) {
            const driveUrl = await driveService.uploadDocument(file.buffer, file.originalname, file.mimetype);
            urls.push(driveUrl);
        }

        res.json({ urls });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error uploading course material' });
    }
});

// Exponer archivos estáticos de la carpeta de uploads
app.use('/uploads', express.static(uploadsDir));
// Mantener la ruta de avatares temporalmente para compatibilidad
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));

// Servir archivos estáticos del frontend desde la carpeta de distribución de Vite
app.use(express.static(path.join(__dirname, '../../IBRIO-ERP-APP/dist')));

// Fallback SPA para rutas que no correspondan a la API
app.get('*any', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  const indexPath = path.join(__dirname, '../../IBRIO-ERP-APP/dist/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('G-IBRO API is running.');
  }
});

// Endpoint de prueba de estado
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET /api/emergency-unlock/:user - Ruta temporal de emergencia para desbloquear la cuenta
app.get('/api/emergency-unlock/:user', async (req, res) => {
  try {
    const { user } = req.params;
    await prisma.user.updateMany({
      where: { user: { equals: user, mode: 'insensitive' } },
      data: { isLocked: false, failedLoginAttempts: 0 }
    });
    res.send(`<h1>Cuenta de ${user} desbloqueada con éxito!</h1><p>Ya puedes intentar iniciar sesión de nuevo.</p>`);
  } catch (error) {
    res.status(500).send(`Error al desbloquear: ${error.message}`);
  }
});

// POST /api/login: Autenticación de usuario con bcrypt
app.post('/api/login', loginLimiter, async (req, res) => {
  // Validación Paranoica con Zod
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
    let dbUser = await prisma.user.findFirst({
      where: { user: { equals: user, mode: 'insensitive' } }
    });

    if (!dbUser) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (dbUser.isLocked) {
      console.log(`\n======================================================`);
      console.log(`[ALERTA] Usuario ya está bloqueado: ${dbUser.user}`);
      console.log(`URL PARA DESBLOQUEAR INMEDIATAMENTE:`);
      console.log(`https://ibro-api.onrender.com/api/emergency-unlock/${encodeURIComponent(dbUser.user)}`);
      console.log(`======================================================\n`);
      return res.status(403).json({ error: 'Cuenta bloqueada por seguridad. Revisa tu correo electrónico para desbloquearla.' });
    }

    // Verificar contraseña (soporte legacy y bcrypt)
    let matches = false;
    const isBcrypt = dbUser.pass.startsWith('$2a$') || dbUser.pass.startsWith('$2b$') || dbUser.pass.startsWith('$2y$');
      if (isBcrypt) {
        matches = bcrypt.compareSync(pass, dbUser.pass);
      } else {
        matches = (pass === dbUser.pass);
        // Auto-actualizar a bcrypt
        if (matches) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { pass: bcrypt.hashSync(pass, 10) }
          });
        }
      }

    if (matches) {
      // Reiniciar intentos fallidos
      if (dbUser.failedLoginAttempts > 0) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { failedLoginAttempts: 0 }
        });
      }

      const token = jwt.sign(
        { id: dbUser.id, user: dbUser.user, roleId: dbUser.roleId },
        process.env.JWT_SECRET || 'ibro_fallback_secret_2026',
        { expiresIn: '15m' } // 15 minutos para accessToken (Alta seguridad)
      );

      const refreshToken = jwt.sign(
        { id: dbUser.id, user: dbUser.user },
        process.env.JWT_SECRET || 'ibro_fallback_secret_2026',
        { expiresIn: '7d' } // 7 días para refreshToken
      );

      // Guardar refreshToken en la base de datos
      const nowIso = new Date().toISOString();
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { 
          refreshToken,
          lastLogin: nowIso,
          isOnline: true
        }
      });

      // Registrar auditoría
      await prisma.auditoria.create({
        data: {
          userId: dbUser.id,
          fecha: new Date(),
          action: 'LOGIN',
          modulo: 'Autenticación',
          recordDetails: 'Inicio de sesión exitoso'
        }
      });
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
    } else {
      // Incrementar intentos fallidos
      const newAttempts = dbUser.failedLoginAttempts + 1;
      let isNowLocked = false;
      
      if (newAttempts >= 3) {
        isNowLocked = true;
        // Generar token de recuperación
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expire = Date.now() + 3600000; // 1 hora
        
        await prisma.pendingReset.create({
          data: {
            user: dbUser.user,
            token,
            expire
          }
        });

        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}&user=${encodeURIComponent(dbUser.user)}`;
        await sendLockoutEmail(dbUser.correo, dbUser.nombre, resetLink);
      }

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { 
          failedLoginAttempts: newAttempts,
          isLocked: isNowLocked
        }
      });

      if (isNowLocked) {
        console.log(`\n======================================================`);
        console.log(`[ALERTA] Usuario bloqueado: ${dbUser.user}`);
        console.log(`URL PARA DESBLOQUEAR INMEDIATAMENTE:`);
        console.log(`https://ibro-api.onrender.com/api/emergency-unlock/${encodeURIComponent(dbUser.user)}`);
        console.log(`======================================================\n`);
        return res.status(403).json({ error: 'Cuenta bloqueada por demasiados intentos fallidos. Revisa tu correo.' });
      }

      return res.status(401).json({ error: `Contraseña incorrecta. Intento ${newAttempts} de 3.` });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno en el servidor de autenticación' });
  }
});

// POST /api/logout: Cerrar sesión segura
app.post('/api/logout', async (req, res) => {
  // Limpiar refreshToken de la base de datos si es posible
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'ibro_fallback_secret_2026');
      await prisma.user.update({
        where: { id: decoded.id },
        data: { refreshToken: null }
      });
    } catch (e) {
      console.log('Error invalidating refresh token on logout');
    }
  }

  const cookieOpts = { httpOnly: true, secure: true, sameSite: 'none' };
  res.clearCookie('token', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.json({ success: true });
});

// POST /api/refresh: Rotación de sesión silenciosa
app.post('/api/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token provided' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'ibro_fallback_secret_2026');
    
    // Verificar si el token sigue siendo válido en la base de datos
    const dbUser = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!dbUser || dbUser.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Refresh token invalid or revoked' });
    }

    // Emitir nuevo access token
    const token = jwt.sign(
      { id: dbUser.id, user: dbUser.user, roleId: dbUser.roleId },
      process.env.JWT_SECRET || 'ibro_fallback_secret_2026',
      { expiresIn: '15m' }
    );

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
    res.status(403).json({ error: 'Refresh token expired' });
  }
});

// GET /api/gemini/test-key: Diagnosticar la clave de API activa
app.get('/api/gemini/test-key', authenticateToken, (req, res) => {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    return res.json({ hasKey: false, message: 'No hay ninguna clave configurada en process.env.GEMINI_API_KEY' });
  }
  return res.json({
    hasKey: true,
    length: key.length,
    prefix: key.substring(0, 6) + '...',
    suffix: '...' + key.substring(key.length - 4),
    message: 'Compara este prefijo y sufijo con tu clave copiada de Google AI Studio para verificar si Render ya aplicó los cambios.'
  });
});

// GET /api/gemini/logs: Obtener la bitácora de ejecución de consultas de Gemini
app.get('/api/gemini/logs', authenticateToken, (req, res) => {
  return res.json({
    logs: geminiLogs || []
  });
});

// GET /api/gemini/list-models: Listar modelos disponibles con la API Key actual
app.get('/api/gemini/list-models', authenticateToken, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    return res.json({ success: false, error: 'No hay API Key configurada' });
  }
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const result = await genAI.listModels();
    return res.json({
      success: true,
      models: result.models || result
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/gemini/chat: Comunicar con el Asistente Gemini
app.post('/api/gemini/chat', authenticateToken, async (req, res) => {
  const { prompt, history, model } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Falta el parámetro "prompt"' });
  }

  try {
    const aiResponse = await askGemini(prompt, history || [], model || null);
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Gemini chat error:', error.message);
    res.status(500).json({ error: error.message || 'Error interno al procesar con Gemini' });
  }
});

// POST /api/auth/recover: Iniciar flujo de recuperación de contraseña enviando correo
app.post('/api/auth/recover', async (req, res) => {
  const { user, origin } = req.body;
  if (!user) {
    return res.status(400).json({ error: 'Usuario requerido' });
  }

  try {
    const dbUser = await prisma.user.findFirst({
      where: { user: { equals: user, mode: 'insensitive' } }
    });

    if (!dbUser) {
      return res.status(404).json({ error: 'El usuario no existe en la base de datos.' });
    }

    if (!dbUser.correo) {
      return res.status(400).json({ error: 'El usuario existe, pero no tiene registrado un correo electrónico asociado.' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expireTime = Date.now() + 3600000; // 1 hora

    // Guardar token en base de datos
    await prisma.pendingReset.create({
      data: {
        user: dbUser.user,
        token: verificationCode,
        expire: expireTime
      }
    });

    let appOrigin = 'https://g-ibro.onrender.com';
    if (origin && origin.startsWith('http') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      appOrigin = origin.split('?')[0];
    }
    const resetLink = `${appOrigin}?resetUser=${encodeURIComponent(dbUser.user)}&resetToken=${verificationCode}`;

    let mailRes;
    try {
      mailRes = await sendRecoveryEmail(dbUser.correo, `${dbUser.nombre} ${dbUser.apellido}`, resetLink);
    } catch (mailError) {
      console.warn('[SMTP ERROR] Failed to send recovery email.');
      console.error(mailError);
      return res.status(500).json({ error: 'No se pudo despachar el correo debido a un error del servicio de mensajería. Por favor intenta más tarde.' });
    }

    if (mailRes.mockMode) {
      // Incluso en mock mode ya no devolvemos el resetLink al frontend. 
      // Se registrará en la consola del servidor únicamente para el desarrollador.
      return res.json({
        success: true,
        message: 'Modo de prueba activo en el servidor. Revisa los logs de la consola del servidor.'
      });
    }

    res.json({ success: true, message: 'Correo de recuperación enviado con éxito.' });
  } catch (error) {
    console.error('Recovery request error:', error);
    res.status(500).json({ error: 'Error al procesar la recuperación de contraseña: ' + error.message });
  }
});

// POST /api/auth/reset-password: Validar token y cambiar contraseña
app.post('/api/auth/reset-password', async (req, res) => {
  const { user, token, newPassword } = req.body;
  if (!user || !token || !newPassword) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const pending = await prisma.pendingReset.findFirst({
      where: {
        user: { equals: user, mode: 'insensitive' },
        token: token
      }
    });

    if (!pending) {
      return res.status(400).json({ error: 'El código de seguridad o usuario es incorrecto.' });
    }

    if (pending.expire < Date.now()) {
      await prisma.pendingReset.delete({ where: { id: pending.id } });
      return res.status(400).json({ error: 'El código de seguridad ha expirado.' });
    }

    // Buscar al usuario
    const dbUser = await prisma.user.findFirst({
      where: { user: { equals: user, mode: 'insensitive' } }
    });

    if (!dbUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Actualizar contraseña encriptándola
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { pass: hashedPassword }
    });

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        id: Date.now().toString() + Math.random().toString().slice(-4),
        userId: dbUser.id,
        fecha: new Date(),
        action: 'Modificar',
        modulo: 'Usuario',
        recordDetails: `Cambio de contraseña para usuario [${dbUser.user}] mediante enlace de correo`
      }
    });

    // Eliminar el token usado
    await prisma.pendingReset.delete({ where: { id: pending.id } });

    res.json({ success: true, message: 'Contraseña restablecida con éxito.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Error al restablecer la contraseña: ' + error.message });
  }
});

// POST /api/db/informes-config
app.post('/api/db/informes-config', authenticateToken, async (req, res) => {
  try {
    const data = req.body;
    const existing = await prisma.informesConfig.findUnique({ where: { id: 1 } });
    
    if (existing) {
      await prisma.informesConfig.update({ where: { id: 1 }, data });
    } else {
      await prisma.informesConfig.create({ data: { id: 1, ...data } });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving informes config:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/db: Carga el JSON global para el frontend mapeando relaciones
app.get('/api/db', authenticateToken, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, nombre: true, apellido: true, cedula: true, tipoDoc: true,
        correo: true, cargo: true, telefono: true, observaciones: true,
        user: true, roleId: true, meta_u: true, ejec_u: true, meta_p: true,
        ejec_p: true, soundsEnabled: true, cumpleanos: true,
        habeasDataAccepted: true, failedLoginAttempts: true, isLocked: true,
        lastLogin: true, isOnline: true, foto: true, lat: true, lng: true,
        lastLocationUpdate: true, codigoAsesor: true
      },
      orderBy: { id: 'asc' }
    });
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' } });
    const clientes = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
    const inventario = await prisma.inventario.findMany({ orderBy: { id: 'asc' } });
    
    // Mapear Ventas (incluyendo Cliente y Producto)
    const ventasRaw = await prisma.venta.findMany({
      take: 50,
      include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
      orderBy: { id: 'desc' }
    });
    ventasRaw.reverse();
    const ventas = ventasRaw.map(v => ({
      id: v.id,
      fecha: v.fecha,
      fechaIso: v.fechaIso,
      venceGarantiaIso: v.venceGarantiaIso,
      mesesGarantia: v.mesesGarantia,
      vendedor: v.vendedor?.user || '',
      vendedorId: v.vendedorId,
      docCli: v.cliente.doc,
      cliente: v.cliente.nom,
      items: v.items.map(i => ({
        productoId: i.productoId,
        producto: i.producto.ref,
        cant: i.cant,
        desc: i.desc,
        precioUnitario: i.precioUnitario,
        serialEquipo: i.serialEquipo
      })),
      // Legacy flat fields for retro-compatibility (first item)
      idProd: v.items[0]?.productoId || null,
      producto: v.items[0]?.producto?.ref || null,
      cant: v.items.reduce((acc, i) => acc + i.cant, 0),
      desc: v.items.reduce((acc, i) => acc + i.desc, 0),
      precioUnitario: v.items[0]?.precioUnitario || null,
      serialEquipo: v.items[0]?.serialEquipo || null,
      
      metodoPago: v.metodoPago,
      total: v.total,
      comisionistaId: v.comisionistaId,
      comisionistaNombre: v.comisionistaNombre,
      comisionistaPct: v.comisionistaPct,
      comisionistaValor: v.comisionistaValor,
      tipo_precio: v.tipo_precio,
      lockedBy: v.lockedBy,
      vendedorNombre: v.vendedorNombre,
      vendedorCargo: v.vendedorCargo,
      vendedorEmail: v.vendedorEmail,
      vendedorMovil: v.vendedorMovil,
      vendedorCodigoAsesor: v.vendedorCodigoAsesor
    }));

    // Mapear PQRS
    const pqrsRaw = await prisma.pQR.findMany({
      include: { cliente: true },
      orderBy: { id: 'asc' }
    });
    const pqrs = pqrsRaw.map(p => ({
      id: p.id,
      fecha: p.fecha,
      limiteIso: p.limiteIso,
      docCli: p.cliente.doc,
      cliente: p.cliente.nom,
      tipo: p.tipo,
      detalle: p.detalle,
      evidencia: p.evidencia,
      fileUrl: p.fileUrl,
      estado: p.estado,
      satisfecho: p.satisfecho,
      lockedBy: p.lockedBy,
      radicado: p.radicado,
      hechos: p.hechos,
      solicitudes: p.solicitudes,
      evidencias: p.evidencias && p.evidencias.trim() !== '' ? p.evidencias : '[]',
      aplicaGarantia: p.aplicaGarantia,
      tratamientoGarantia: p.tratamientoGarantia,
      terminoLegal: p.terminoLegal,
      fechaCierre: p.fechaCierre,
      inventarioId: p.inventarioId,
      ventaId: p.ventaId,
      cotizacionId: p.cotizacionId,
      trazabilidad: p.trazabilidad && p.trazabilidad.trim() !== '' ? p.trazabilidad : '[]',
      usuarioAsignado: p.usuarioAsignado
    }));

    // Mapear Servicios Técnicos
    const serviciosRaw = await prisma.servicio.findMany({
      include: { cliente: true },
      orderBy: { id: 'asc' }
    });
    const servicios = serviciosRaw.map(s => ({
      id: s.id,
      docCli: s.cliente.doc,
      cliente: s.cliente.nom,
      fechaProg: s.fechaProg,
      tipo: s.tipo,
      obs: s.obs,
      estado: s.estado,
      obsAdmin: s.obsAdmin,
      lockedBy: s.lockedBy,
      tecnico: s.tecnico || '',
      equipoDetalle: s.equipoDetalle || '',
      obsRecepcion: s.obsRecepcion || '',
      obsDiagnostico: s.obsDiagnostico || '',
      obsCotizacion: s.obsCotizacion || '',
      obsEjecucion: s.obsEjecucion || '',
      obsCalidad: s.obsCalidad || '',
      fechaCreacion: s.fechaCreacion || '',
      fechaIso: s.fechaIso || '',
      radicado: s.radicado,
      inventarioId: s.inventarioId,
      ventaId: s.ventaId,
      cotizacionId: s.cotizacionId,
      etapaActual: s.etapaActual,
      evidencias: s.evidencias && s.evidencias.trim() !== '' ? s.evidencias : '[]',
      trazabilidad: s.trazabilidad && s.trazabilidad.trim() !== '' ? s.trazabilidad : '[]',
      aplicaGarantia: s.aplicaGarantia,
      costoServicio: s.costoServicio
    }));

    const solicitudesRaw = await prisma.solicitud.findMany({ orderBy: { id: 'asc' } });
    const solicitudes = solicitudesRaw.map(s => ({
      id: s.id,
      fecha: s.fecha,
      asesor: s.asesor,
      nombreAsesor: s.nombreAsesor || '',
      tipo: s.tipo,
      detalle: s.detalle || '',
      evidencia: s.evidencia || null,
      fileUrl: s.fileUrl || null,
      estado: s.estado,
      lockedBy: s.lockedBy || null,
      comentario: s.comentario || '',
      fechaRadicado: s.fechaRadicado || ''
    }));

    const procesosDisciplinarios = await prisma.procesoDisciplinario.findMany({ orderBy: { id: 'asc' } });

    const evaluacionesRaw = await prisma.evaluacion.findMany({ orderBy: { id: 'asc' } });
    const evaluaciones = evaluacionesRaw.map(ev => ({
      id: ev.id,
      fecha: ev.fecha,
      evaluador: ev.evaluador || '',
      evaluado: ev.evaluado || '',
      evaluadoNombre: ev.evaluadoNombre || '',
      tipo: ev.tipo || '',
      obs: ev.obs || '',
      lockedBy: ev.lockedBy || null,
      empleado: ev.empleado || '',
      metajobs: ev.metajobs || 5,
      asistencia: ev.asistencia || 5,
      objetivos: ev.objetivos || 5,
      promedio: ev.promedio || 5.0,
      scores: ev.scores || null
    }));

    const anunciosRaw = await prisma.anuncio.findMany({ orderBy: { id: 'asc' } });
    const anuncios = anunciosRaw.map(a => ({
      id: a.id,
      fecha: a.fecha || '',
      titulo: a.titulo,
      mensaje: a.mensaje || '',
      lockedBy: a.lockedBy || null,
      contenido: a.contenido || '',
      expiresAt: a.expiresAt || '',
      expired: a.expired || false
    }));

    // Mapear Cotizaciones
    const cotizacionesRaw = await prisma.cotizacion.findMany({
      include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
      orderBy: { id: 'asc' }
    });
    const cotizaciones = cotizacionesRaw.map(c => ({
      id: c.id,
      numCotizacion: c.numCotizacion,
      fecha: c.fecha,
      vendedor: c.vendedor?.user || '',
      vendedorId: c.vendedorId,
      docCli: c.cliente.doc,
      cliente: c.cliente.nom,
      
      items: c.items.map(i => ({
        productoId: i.productoId,
        producto: i.producto.ref,
        cant: i.cant,
        desc: i.desc,
        precioUnitario: i.precioUnitario
      })),
      // Legacy flat fields for retro-compatibility (first item)
      idProd: c.items[0]?.productoId || null,
      producto: c.items[0]?.producto?.ref || null,
      cant: c.items.reduce((acc, i) => acc + i.cant, 0),
      desc: c.items.reduce((acc, i) => acc + i.desc, 0),
      precioUnitario: c.items[0]?.precioUnitario || null,
      
      total: c.total,
      comisionistaId: c.comisionistaId,
      comisionistaNombre: c.comisionistaNombre,
      comisionistaPct: c.comisionistaPct,
      comisionistaValor: c.comisionistaValor,
      lockedBy: c.lockedBy,
      contacto: c.contacto,
      condiciones: c.condiciones,
      tiempoEntrega: c.tiempoEntrega,
      direccionEntrega: c.direccionEntrega,
      detallePagoMixto: c.detallePagoMixto,
      cuentas: c.cuentas,
      firmanteNombre: c.firmanteNombre,
      firmanteCargo: c.firmanteCargo,
      firmanteCorreo: c.firmanteCorreo,
      firmanteMovil: c.firmanteMovil,
      garantia: c.garantia,
      observacion: c.observacion,
      vendedorNombre: c.vendedorNombre,
      vendedorCargo: c.vendedorCargo,
      vendedorEmail: c.vendedorEmail,
      vendedorMovil: c.vendedorMovil,
      vendedorCodigoAsesor: c.vendedorCodigoAsesor,
      vigencia: c.vigencia,
      ivaTipo: c.ivaTipo,
      equipos: c.equipos || [],
      materiales: c.materiales || [],
      tipo_precio: c.tipo_precio,
      fechaSeguimiento: c.fechaSeguimiento,
      estadoSeguimiento: c.estadoSeguimiento,
      motivoSeguimiento: c.motivoSeguimiento,
      motivoNoCompra: c.motivoNoCompra
    }));

    const chatGroupsRaw = await prisma.chatGroup.findMany({ orderBy: { fecha: 'asc' } });
    const chatGroups = chatGroupsRaw.map(g => ({
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion || '',
      createdBy: g.createdBy,
      fecha: g.fecha,
      integrantes: g.integrantes || []
    }));

    const chatDesc = await prisma.chat.findMany({ orderBy: { timestamp: 'desc' }, take: 150 });
    const chat = chatDesc.reverse();
    const auditoriaDesc = await prisma.auditoria.findMany({ orderBy: { id: 'desc' }, take: 200 });
    const auditoria = auditoriaDesc.reverse();
    const notificacionesDesc = await prisma.notificacion.findMany({ orderBy: { id: 'desc' }, take: 100 });
    const notificaciones = notificacionesDesc.reverse();
    const cuentasCobroRaw = await prisma.cuentasCobro.findMany({ orderBy: { fecha: 'asc' } });
    const cuentasCobro = cuentasCobroRaw.map(c => ({
      id: c.id,
      ciudad: c.ciudad || '',
      fecha: c.fecha || '',
      cuenta: c.cuenta || '',
      nombre: c.nombre || '',
      cedula: c.cedula || '',
      correo: c.correo || '',
      concepto: c.concepto || '',
      items: c.items || [],
      nequi: c.nequi || '',
      titular: c.titular || '',
      estado: c.estado || '',
      total: c.total || 0
    }));

    const comisionistasRaw = await prisma.comisionista.findMany({ orderBy: { id: 'asc' } });
    const comisionistas = comisionistasRaw.map(c => ({
      id: c.id,
      tipo: c.tipo || '',
      nombre: c.nombre,
      cedula: c.cedula || '',
      telefono: c.telefono || '',
      correo: c.correo || '',
      direccion: c.direccion || '',
      cliente_remite: c.cliente_remite || '',
      valor_venta: c.valor_venta || 0,
      pct_comision: c.pct_comision || 10,
      fecha: c.fecha || '',
      owner: c.owner || '',
      lockedBy: c.lockedBy || null,
      doc: c.doc || '',
      tel: c.tel || '',
      porcentaje: c.porcentaje || 10
    }));

    // WhatsApp Config
    const config = await prisma.whatsappConfig.findFirst();
    const whatsappConfig = config ? { phone: config.phone, status: config.status } : { phone: '', status: 'Activo' };
    const informesConfig = await prisma.informesConfig.findUnique({ where: { id: 1 } });
    
    // Configuración general combinada
    const appConfig = {
      whatsapp: whatsappConfig || { phone: '', status: 'Activo' },
      informes: informesConfig || { 
        margenOperativo: 72, 
        ingresoProyectos: 85, 
        gastosInstalacion: 35, 
        anticipos: 12450000, 
        gastosCajaChica: 2180000,
        diasHabilesMes: 25,
        mesPresupuesto: "ACTUAL",
        fechaCorte: "HOY",
        diasTranscurridos: 0
      }
    };

    const capacitacionesRaw = await prisma.capacitacion.findMany({ orderBy: { fecha: 'desc' } });
    const capacitaciones = capacitacionesRaw.map(c => ({
      id: c.id,
      tema: c.tema,
      descripcion: c.descripcion || '',
      fecha: c.fecha,
      hora: c.hora,
      obligatoria: c.obligatoria,
      creador: c.creador,
      videoLink: c.videoLink || '',
      materiales: c.materiales || [],
      asistentes: c.asistentes || [],
      evaluacion: c.evaluacion || null,
      estado: c.estado,
      lockedBy: c.lockedBy
    }));

    const pendingResets = await prisma.pendingReset.findMany({ orderBy: { id: 'asc' } });

    res.json({
      users,
      roles,
      clientes,
      inventario,
      ventas,
      pqrs,
      servicios,
      solicitudes,
      procesosDisciplinarios,
      evaluaciones,
      anuncios,
      cotizaciones,
      chatGroups,
      chat,
      auditoria,
      notificaciones,
      comisionistas,
      cuentasCobro,
      capacitaciones,
      config: appConfig,
      whatsappConfig,
      pendingResets
    });
  } catch (error) {
    console.error('Error fetching database:', error);
    res.status(500).json({ error: 'Error al cargar la base de datos', details: error.message });
  }
});

// POST /api/location/update: Reportar ubicación en tiempo real
app.post('/api/location/update', authenticateToken, async (req, res) => {
  const { user, lat, lng } = req.body;
  if (!user || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Faltan datos de ubicación' });
  }

  try {
    await prisma.user.updateMany({
      where: { user: { equals: user, mode: 'insensitive' } },
      data: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        lastLocationUpdate: Date.now()
      }
    });
    res.json({ success: true });
    } catch (error) {
    console.error('Error actualizando ubicación:', error);
    res.status(500).json({ error: 'Error del servidor', details: error.message, stack: error.stack });
  }
});

// GET /api/location/users: Obtener la ubicación de todos los usuarios
app.get('/api/location/users', authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        nombre: true,
        apellido: true,
        cargo: true,
        lat: true,
        lng: true,
        lastLocationUpdate: true
      },
      where: {
        lat: { not: null },
        lng: { not: null }
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Error obteniendo ubicaciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/paginated/:model
app.get('/api/paginated/:model', authenticateToken, async (req, res) => {
  const model = req.params.model;
  const take = parseInt(req.query.take) || 50;
  const skip = parseInt(req.query.skip) || 0;

  try {
    let result = [];
    if (model === 'ventas') {
      const raw = await prisma.venta.findMany({
        skip, take,
        include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
        orderBy: { id: 'desc' }
      });
      raw.reverse();
      result = raw.map(v => ({
        id: v.id,
        fecha: v.fecha,
        fechaIso: v.fechaIso,
        venceGarantiaIso: v.venceGarantiaIso,
        mesesGarantia: v.mesesGarantia,
        vendedor: v.vendedor?.user || '',
        vendedorId: v.vendedorId,
        docCli: v.cliente.doc,
        cliente: v.cliente.nom,
        items: v.items.map(i => ({
          productoId: i.productoId,
          producto: i.producto.ref,
          cant: i.cant,
          desc: i.desc,
          precioUnitario: i.precioUnitario,
          serialEquipo: i.serialEquipo
        })),
        idProd: v.items[0]?.productoId || null,
        producto: v.items[0]?.producto?.ref || null,
        cant: v.items.reduce((acc, i) => acc + i.cant, 0),
        desc: v.items.reduce((acc, i) => acc + i.desc, 0),
        precioUnitario: v.items[0]?.precioUnitario || null,
        serialEquipo: v.items[0]?.serialEquipo || null,
        metodoPago: v.metodoPago,
        total: v.total,
        comisionistaId: v.comisionistaId,
        comisionistaNombre: v.comisionistaNombre,
        comisionistaPct: v.comisionistaPct,
        comisionistaValor: v.comisionistaValor,
        facturado: v.facturado,
        observacion: v.observacion,
        estadoAprobacion: v.estadoAprobacion,
        estadoFacturacion: v.estadoFacturacion,
        lockedBy: v.lockedBy,
        lockedAt: v.lockedAt,
        numPedido: v.numPedido,
        clienteNombre: v.clienteNombre,
        clienteDireccion: v.clienteDireccion,
        clienteCiudadDpto: v.clienteCiudadDpto,
        clientePais: v.clientePais,
        clienteTelefono: v.clienteTelefono,
        clienteMovil: v.clienteMovil,
        clienteEmail: v.clienteEmail,
        clienteNit: v.clienteNit,
        contacto: v.contacto,
        condicionesComerciales: v.condicionesComerciales,
        detallePagoMixto: v.detallePagoMixto,
        tiempoEntrega: v.tiempoEntrega,
        direccionEntrega: v.direccionEntrega,
        fechaEntrega: v.fechaEntrega,
        horaEntrega: v.horaEntrega,
        vigencia: v.vigencia,
        garantia: v.garantia,
        tipoGarantia: v.tipoGarantia,
        tiempoGarantia: v.tiempoGarantia,
        tiempoGarantiaDefecto: v.tiempoGarantiaDefecto,
        ivaTipo: v.ivaTipo,
        priceTier: v.priceTier,
        vendedorNombre: v.vendedorNombre,
        vendedorCargo: v.vendedorCargo,
        vendedorEmail: v.vendedorEmail,
        vendedorMovil: v.vendedorMovil,
        vendedorCodigoAsesor: v.vendedorCodigoAsesor,
        equipos: v.equipos,
        materiales: v.materiales,
        cuentasBancarias: v.cuentasBancarias
      }));
    } else if (model === 'cotizaciones') {
      const raw = await prisma.cotizacion.findMany({
        skip, take,
        include: { items: { include: { producto: true } }, vendedor: true },
        orderBy: { id: 'desc' }
      });
      raw.reverse();
      result = raw.map(c => ({
        id: c.id,
        fecha: c.fecha,
        fechaIso: c.fechaIso,
        vendedor: c.vendedor?.user || '',
        vendedorId: c.vendedorId,
        cliente: c.cliente,
        items: c.items.map(i => ({
          productoId: i.productoId,
          producto: i.producto.ref,
          cant: i.cant,
          desc: i.desc,
          precioUnitario: i.precioUnitario
        })),
        idProd: c.items[0]?.productoId || null,
        producto: c.items[0]?.producto?.ref || null,
        cant: c.items.reduce((acc, i) => acc + i.cant, 0),
        desc: c.items.reduce((acc, i) => acc + i.desc, 0),
        precioUnitario: c.items[0]?.precioUnitario || null,
        metodoPago: c.metodoPago,
        total: c.total,
        observacion: c.observacion,
        estado: c.estado,
        lockedBy: c.lockedBy,
        lockedAt: c.lockedAt,
        numCotizacion: c.numCotizacion,
        clienteNombre: c.clienteNombre,
        clienteDireccion: c.clienteDireccion,
        clienteCiudadDpto: c.clienteCiudadDpto,
        clientePais: c.clientePais,
        clienteTelefono: c.clienteTelefono,
        clienteMovil: c.clienteMovil,
        clienteEmail: c.clienteEmail,
        clienteNit: c.clienteNit,
        contacto: c.contacto,
        condicionesComerciales: c.condicionesComerciales,
        detallePagoMixto: c.detallePagoMixto,
        tiempoEntrega: c.tiempoEntrega,
        direccionEntrega: c.direccionEntrega,
        fechaEntrega: c.fechaEntrega,
        horaEntrega: c.horaEntrega,
        vigencia: c.vigencia,
        garantia: c.garantia,
        tipoGarantia: c.tipoGarantia,
        tiempoGarantia: c.tiempoGarantia,
        tiempoGarantiaDefecto: c.tiempoGarantiaDefecto,
        ivaTipo: c.ivaTipo,
        priceTier: c.priceTier,
        vendedorNombre: c.vendedorNombre,
        vendedorCargo: c.vendedorCargo,
        vendedorEmail: c.vendedorEmail,
        vendedorMovil: c.vendedorMovil,
        vendedorCodigoAsesor: c.vendedorCodigoAsesor,
        equipos: c.equipos,
        materiales: c.materiales,
        cuentasBancarias: c.cuentasBancarias
      }));
    } else if (model === 'chat') {
      result = await prisma.chat.findMany({ skip, take, orderBy: { timestamp: 'desc' } });
      result.reverse();
    } else if (model === 'pqrs') {
      result = await prisma.pQR.findMany({ skip, take, orderBy: { id: 'desc' } });
      result.reverse();
    } else if (model === 'facturas') {
      result = await prisma.cuentasCobro.findMany({ skip, take, orderBy: { id: 'desc' } });
      result.reverse();
    } else if (model === 'chatGroups') {
      result = await prisma.chatGroup.findMany({ skip, take, orderBy: { id: 'desc' } });
      result.reverse();
    } else {
      return res.status(400).json({ error: 'Model not supported for pagination' });
    }
    res.json({ [model]: result });
  } catch (err) {
    console.error('Error in /api/paginated:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/db/sync: Procesa el diff incremental del cliente
app.post('/api/db/sync', authenticateToken, async (req, res) => {
  const { diff, user } = req.body;
  if (!diff) {
    return res.status(400).json({ error: 'No diff payload provided' });
  }

  try {
    // 🛡️ Zod Global: Validación Estricta
    validateSyncPayload(diff);
  } catch (validationError) {
    console.error('Zod Validation Blocked Request:', validationError.message);
    return res.status(400).json({ error: validationError.message });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Helper para upserts en tablas planas directas
      const flatUpsert = async (table, items) => {
        for (const item of items) {
          const { ...data } = item;

          // Pre-cleaning: Remove any nested arrays/objects that aren't native Json fields to prevent Prisma crashes
          const allowedJsonFields = ['permissions', 'adjuntos', 'equipos', 'materiales', 'evidencias', 'trazabilidad', 'scores', 'integrantes', 'shadowingData', 'items', 'asistentes', 'evaluacion'];
          for (const key in data) {
            if (data[key] !== null && typeof data[key] === 'object' && !(data[key] instanceof Date)) {
              if (!allowedJsonFields.includes(key)) {
                delete data[key];
              }
            }
          }

          // Forzar tipos numéricos para Prisma
          if (table === 'inventario') {
            if (data.cant !== undefined) data.cant = parseInt(data.cant) || 0;
            if (data.pedido !== undefined) data.pedido = parseInt(data.pedido) || 0;
            if (data.precio !== undefined) data.precio = parseFloat(data.precio) || 0;
            if (data.precio_publico !== undefined && data.precio_publico !== null) data.precio_publico = parseFloat(data.precio_publico) || null;
            if (data.precio_tecnico !== undefined && data.precio_tecnico !== null) data.precio_tecnico = parseFloat(data.precio_tecnico) || null;
            if (data.precio_mayorista !== undefined && data.precio_mayorista !== null) data.precio_mayorista = parseFloat(data.precio_mayorista) || null;
            if (data.precio_costo !== undefined && data.precio_costo !== null) data.precio_costo = parseFloat(data.precio_costo) || null;
            if (data.vendidas !== undefined) data.vendidas = parseInt(data.vendidas) || 0;
          } else if (table === 'cliente') {
            if (data.condicionesPagoDias !== undefined && data.condicionesPagoDias !== null) data.condicionesPagoDias = parseInt(data.condicionesPagoDias) || null;
            if (data.porcentajeAutorizado !== undefined && data.porcentajeAutorizado !== null) data.porcentajeAutorizado = parseFloat(data.porcentajeAutorizado) || null;
            if (data.adjuntos !== undefined && data.adjuntos !== null && typeof data.adjuntos !== 'string') {
               /* no op for Json */
            }
          } else if (table === 'comisionista') {
            if (data.valor_venta !== undefined && data.valor_venta !== null) data.valor_venta = parseFloat(data.valor_venta) || null;
            if (data.pct_comision !== undefined && data.pct_comision !== null) data.pct_comision = parseFloat(data.pct_comision) || null;
            if (data.porcentaje !== undefined && data.porcentaje !== null) data.porcentaje = parseFloat(data.porcentaje) || null;
          } else if (table === 'user') {
            if (data.meta_u !== undefined) data.meta_u = parseFloat(data.meta_u) || 0;
            if (data.ejec_u !== undefined) data.ejec_u = parseFloat(data.ejec_u) || 0;
            if (data.meta_p !== undefined) data.meta_p = parseFloat(data.meta_p) || 0;
            if (data.ejec_p !== undefined) data.ejec_p = parseFloat(data.ejec_p) || 0;
            if (data.cumpleanos && typeof data.cumpleanos === 'string') {
              const d = new Date(data.cumpleanos);
              if (!isNaN(d)) {
                data.cumpleanos = d.toISOString();
              } else {
                data.cumpleanos = null;
              }
            } else if (data.cumpleanos === "") {
              data.cumpleanos = null;
            }
          } else if (table === 'evaluacion') {
            if (data.scores && typeof data.scores === 'string') {
              
            }
          } else if (table === 'procesoDisciplinario') {
            if (data.etapa !== undefined) data.etapa = parseInt(data.etapa) || 1;
            if (data.diasSuspension !== undefined) data.diasSuspension = parseInt(data.diasSuspension) || 0;
            if (data.timestampEtapa !== undefined) data.timestampEtapa = parseFloat(data.timestampEtapa) || 0;
          } else if (table === 'capacitacion') {
            if (data.materiales !== undefined && typeof data.materiales !== 'string') {}
            if (data.asistentes !== undefined && typeof data.asistentes !== 'string') {}
            if (data.evaluacion !== undefined && typeof data.evaluacion !== 'string') {}
          } else if (table === 'auditoria') {
            if (data.user && typeof data.user === 'string') {
              let usernameToSearch = data.user;
              const match = data.user.match(/\(([^)]+)\)$/);
              if (match && match[1]) {
                usernameToSearch = match[1];
              }

              const dbU = await tx.user.findFirst({ where: { user: usernameToSearch } });
              if (dbU) {
                data.userId = dbU.id;
              } else {
                const fallbackUser = await tx.user.findFirst({ orderBy: { id: 'asc' } });
                data.userId = fallbackUser?.id || "1";
              }
              delete data.user;
            }
            if (data.fecha) {
              const d = new Date(data.fecha);
              if (!isNaN(d)) {
                data.fecha = d;
              } else {
                data.fecha = new Date(); // Fallback for localized invalid strings
              }
            } else {
              data.fecha = new Date();
            }
          }

        if (table === 'user') {
          // Ya permitimos que foto se guarde y sincronice
        }

        // Evitar conflictos por llaves únicas (como doc en Clientes o user en Usuarios)
        if (table === 'cliente' && item.doc) {
          const existing = await tx.cliente.findUnique({ where: { doc: item.doc } });
          if (existing) {
            delete data.id;
            await tx.cliente.update({
              where: { id: existing.id },
              data
            });
            continue;
          }
        }

        if (table === 'user' && item.user) {
          const existing = await tx.user.findUnique({ where: { user: item.user } });
          if (existing) {
            delete data.id;
            if (data.pass) {
              const isBcrypt = data.pass.startsWith('$2a$') || data.pass.startsWith('$2b$') || data.pass.startsWith('$2y$');
              if (!isBcrypt) {
                data.pass = bcrypt.hashSync(data.pass, 10);
              }
            }
            await tx.user.update({
              where: { id: existing.id },
              data
            });
            continue;
          }
        }

        if (table === 'user' && data.pass) {
        const isBcrypt = data.pass.startsWith('$2a$') || data.pass.startsWith('$2b$') || data.pass.startsWith('$2y$');
        if (!isBcrypt) {
          data.pass = bcrypt.hashSync(data.pass, 10);
        }
      }

      // Optimistic Concurrency Control (OCC) - Prevención Anti-Sobrescritura
      try {
        const existingRecord = await tx[table].findUnique({ where: { id: item.id } });
        if (existingRecord && existingRecord.lockedBy && existingRecord.lockedBy !== user) {
          console.warn(`[OCC BLOCK] Usuario '${user}' intentó sobrescribir '${table}' ID '${item.id}' que está bloqueado por '${existingRecord.lockedBy}'. Sincronización denegada para este registro.`);
          continue; // Saltar la actualización para no corromper datos del otro asesor
        }
      } catch (e) {
        // Ignorar si la tabla no soporta findUnique por ID u otras razones
      }

      await tx[table].upsert({
        where: { id: item.id },
        update: data,
        create: data,
      });
    }
    };

    // Helper para eliminaciones en tablas planas directas
    const flatDelete = async (table, ids) => {
      if (ids && ids.length > 0) {
        await tx[table].deleteMany({
          where: { id: { in: ids.map(id => id.toString()) } },
        });
      }
    };

    // --- FASE 1: Tablas Independientes ---

    // 1. Roles
    if (diff.roles) {
      await flatUpsert('role', diff.roles.upserted || []);
      await flatDelete('role', diff.roles.deleted || []);
    }

    // 2. Clientes
    if (diff.clientes) {
      await flatUpsert('cliente', diff.clientes.upserted || []);
      await flatDelete('cliente', diff.clientes.deleted || []);
    }

    // 3. Inventario (Productos)
    if (diff.inventario) {
      await flatUpsert('inventario', diff.inventario.upserted || []);
      await flatDelete('inventario', diff.inventario.deleted || []);
    }

    // 4. Usuarios
    if (diff.users) {
      const isBcryptHash = (str) => /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
      const processedUsers = (diff.users.upserted || []).map(u => {
        if (u.pass && !isBcryptHash(u.pass)) {
          return { ...u, pass: bcrypt.hashSync(u.pass, 10) };
        }
        return u;
      });
      await flatUpsert('user', processedUsers);
      await flatDelete('user', diff.users.deleted || []);
    }

    // --- FASE 2: Tablas Relacionales (Dependen de Clientes y Productos) ---

    // 5. Ventas / Facturación
    if (diff.ventas) {
      // Eliminar primero
      await flatDelete('venta', diff.ventas.deleted || []);

      // Upsert
      for (const item of diff.ventas.upserted || []) {
        // Encontrar Cliente (1 sola petición a BD)
        const clientConditions = [];
        if (item.clienteId) clientConditions.push({ id: item.clienteId });
        if (item.docCli) clientConditions.push({ doc: item.docCli });
        const client = clientConditions.length > 0 
          ? await prisma.cliente.findFirst({ where: { OR: clientConditions } }) 
          : null;
        
        // Encontrar Producto (1 sola petición a BD)
        const productConditions = [];
        if (item.productoId) productConditions.push({ id: item.productoId });
        if (item.idProd) productConditions.push({ id: item.idProd });
        if (item.producto) productConditions.push({ ref: item.producto });
        const product = productConditions.length > 0 
          ? await tx.inventario.findFirst({ where: { OR: productConditions } }) 
          : null;

        const vUser = await tx.user.findFirst({ where: { user: item.vendedor } });
        const finalVendedorId = item.vendedorId || (vUser ? vUser.id : null);

        if (!client || !product || !finalVendedorId) {
          throw new Error(`Sync Venta ${item.id} fallida: Cliente, Producto o Vendedor no encontrado.`);
        }

        const data = {
          fecha: item.fecha,
          fechaIso: item.fechaIso,
          venceGarantiaIso: item.venceGarantiaIso,
          mesesGarantia: parseInt(item.mesesGarantia) || 0,
          vendedorId: finalVendedorId,
          clienteId: client.id,
          metodoPago: item.metodoPago || 'Efectivo',
          total: parseFloat(item.total) || 0,
          comisionistaId: item.comisionistaId || null,
          comisionistaNombre: item.comisionistaNombre || null,
          comisionistaPct: item.comisionistaPct ? parseFloat(item.comisionistaPct) : null,
          comisionistaValor: item.comisionistaValor ? parseFloat(item.comisionistaValor) : null,
          tipo_precio: item.tipo_precio || null,
          lockedBy: item.lockedBy || null,
          vendedorNombre: item.vendedorNombre || null,
          vendedorCargo: item.vendedorCargo || null,
          vendedorEmail: item.vendedorEmail || null,
          vendedorMovil: item.vendedorMovil || null,
          vendedorCodigoAsesor: item.vendedorCodigoAsesor || null
        };

        await tx.venta.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });

        // Sincronizar Items de Venta (Backward Compatibility)
        await tx.ventaItem.deleteMany({ where: { ventaId: item.id } });
        const itemsToCreate = (item.items && item.items.length > 0) ? item.items : [{
            productoId: product.id,
            cant: parseInt(item.cant) || 0,
            precioUnitario: item.precioUnitario ? parseFloat(item.precioUnitario) : 0,
            desc: parseFloat(item.desc) || 0,
            serialEquipo: item.serialEquipo || null
        }];

        for (const i of itemsToCreate) {
             await tx.ventaItem.create({
                 data: {
                     ventaId: item.id,
                     productoId: i.productoId || product.id,
                     cant: parseInt(i.cant) || 0,
                     precioUnitario: i.precioUnitario ? parseFloat(i.precioUnitario) : 0,
                     desc: parseFloat(i.desc) || 0,
                     serialEquipo: i.serialEquipo || null
                 }
             });
        }
      }
    }

    // 6. Cotizaciones
    if (diff.cotizaciones) {
      await flatDelete('cotizacion', diff.cotizaciones.deleted || []);

      for (const item of diff.cotizaciones.upserted || []) {
        // Encontrar Cliente (1 sola petición a BD)
        const clientConditions = [];
        if (item.clienteId) clientConditions.push({ id: item.clienteId });
        if (item.docCli) clientConditions.push({ doc: item.docCli });
        const client = clientConditions.length > 0 
          ? await prisma.cliente.findFirst({ where: { OR: clientConditions } }) 
          : null;

        // Encontrar Producto (1 sola petición a BD)
        const productConditions = [];
        if (item.productoId) productConditions.push({ id: item.productoId });
        if (item.idProd) productConditions.push({ id: item.idProd });
        if (item.producto) productConditions.push({ ref: item.producto });
        let product = productConditions.length > 0 
          ? await tx.inventario.findFirst({ where: { OR: productConditions } }) 
          : null;

        // Backwards compatibility fallback if product is not found (e.g. legacy or manual product)
        if (!product) {
          product = await tx.inventario.findFirst();
        }

        const vUser = await tx.user.findFirst({ where: { user: item.vendedor } });
        const finalVendedorId = item.vendedorId || (vUser ? vUser.id : null);

        if (!client || !product || !finalVendedorId) {
          throw new Error(`Sync Cotizacion ${item.id} fallida: Cliente, Producto o Vendedor no encontrado.`);
        }

        const data = {
          numCotizacion: item.numCotizacion || null,
          fecha: item.fecha,
          vendedorId: finalVendedorId,
          clienteId: client.id,
          total: parseFloat(item.total) || 0,
          comisionistaId: item.comisionistaId || null,
          comisionistaNombre: item.comisionistaNombre || null,
          comisionistaPct: item.comisionistaPct ? parseFloat(item.comisionistaPct) : null,
          comisionistaValor: item.comisionistaValor ? parseFloat(item.comisionistaValor) : null,
          lockedBy: item.lockedBy || null,
          contacto: item.contacto || null,
          condiciones: item.condiciones || null,
          tiempoEntrega: item.tiempoEntrega || null,
          direccionEntrega: item.direccionEntrega || null,
          detallePagoMixto: item.detallePagoMixto || null,
          cuentas: item.cuentas || null,
          firmanteNombre: item.firmanteNombre || null,
          firmanteCargo: item.firmanteCargo || null,
          firmanteCorreo: item.firmanteCorreo || null,
          firmanteMovil: item.firmanteMovil || null,
          garantia: item.garantia || null,
          observacion: item.observacion || null,
          vendedorNombre: item.vendedorNombre || null,
          vendedorCargo: item.vendedorCargo || null,
          vendedorEmail: item.vendedorEmail || null,
          vendedorMovil: item.vendedorMovil || null,
          vendedorCodigoAsesor: item.vendedorCodigoAsesor || null,
          vigencia: item.vigencia ? parseInt(item.vigencia) : 10,
          ivaTipo: item.ivaTipo || "exento",
          equipos: item.equipos || null,
          materiales: item.materiales || null,
          tipo_precio: item.tipo_precio || null,
          fechaSeguimiento: item.fechaSeguimiento || null,
          estadoSeguimiento: item.estadoSeguimiento || null,
          motivoSeguimiento: item.motivoSeguimiento || null,
          motivoNoCompra: item.motivoNoCompra || null
        };

        await tx.cotizacion.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });

        // Sincronizar Items de Cotizacion
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: item.id } });
        const cItemsToCreate = (item.items && item.items.length > 0) ? item.items : [{
            productoId: product.id,
            cant: parseInt(item.cant) || 0,
            precioUnitario: item.precioUnitario ? parseFloat(item.precioUnitario) : 0,
            desc: parseFloat(item.desc) || 0
        }];

        for (const i of cItemsToCreate) {
             await tx.cotizacionItem.create({
                 data: {
                     cotizacionId: item.id,
                     productoId: i.productoId || product.id,
                     cant: parseInt(i.cant) || 0,
                     precioUnitario: i.precioUnitario ? parseFloat(i.precioUnitario) : 0,
                     desc: parseFloat(i.desc) || 0
                 }
             });
        }
      }
    }

    // 7. PQRS
    if (diff.pqrs) {
      await flatDelete('pQR', diff.pqrs.deleted || []);

      for (const item of diff.pqrs.upserted || []) {
        // Encontrar Cliente (1 sola petición a BD)
        const clientConditions = [];
        if (item.clienteId) clientConditions.push({ id: item.clienteId });
        if (item.docCli) clientConditions.push({ doc: item.docCli });
        const client = clientConditions.length > 0 
          ? await prisma.cliente.findFirst({ where: { OR: clientConditions } }) 
          : null;
        
        if (!client) {
          throw new Error(`Sync PQR ${item.id} fallida: Cliente con doc ${item.docCli} / ID ${item.clienteId} no encontrado.`);
        }

        const data = {
          fecha: item.fecha,
          limiteIso: item.limiteIso,
          clienteId: client.id,
          tipo: item.tipo,
          detalle: item.detalle,
          evidencia: item.evidencia || null,
          fileUrl: item.fileUrl || null,
          estado: item.estado,
          satisfecho: item.satisfecho,
          lockedBy: item.lockedBy || null,
          radicado: item.radicado || null,
          hechos: item.hechos || null,
          solicitudes: item.solicitudes || null,
          evidencias: item.evidencias || null,
          aplicaGarantia: item.aplicaGarantia ?? false,
          tratamientoGarantia: item.tratamientoGarantia || null,
          terminoLegal: item.terminoLegal || null,
          fechaCierre: item.fechaCierre || null,
          inventarioId: item.inventarioId || null,
          ventaId: item.ventaId || null,
          cotizacionId: item.cotizacionId || null,
          trazabilidad: item.trazabilidad || null,
          usuarioAsignado: item.usuarioAsignado || null,
        };

        await tx.pQR.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });
      }
    }

    // 8. Servicios Técnicos
    if (diff.servicios) {
      await flatDelete('servicio', diff.servicios.deleted || []);

      for (const item of diff.servicios.upserted || []) {
        // Encontrar Cliente (1 sola petición a BD)
        const clientConditions = [];
        if (item.clienteId) clientConditions.push({ id: item.clienteId });
        if (item.docCli) clientConditions.push({ doc: item.docCli });
        const client = clientConditions.length > 0 
          ? await prisma.cliente.findFirst({ where: { OR: clientConditions } }) 
          : null;
        
        if (!client) {
          throw new Error(`Sync Servicio ${item.id} fallida: Cliente con doc ${item.docCli} / ID ${item.clienteId} no encontrado.`);
        }

        const data = {
          clienteId: client.id,
          fechaProg: item.fechaProg,
          tipo: item.tipo,
          obs: item.obs,
          estado: item.estado,
          obsAdmin: item.obsAdmin || null,
          lockedBy: item.lockedBy || null,
          tecnico: item.tecnico || null,
          equipoDetalle: item.equipoDetalle || null,
          obsRecepcion: item.obsRecepcion || null,
          obsDiagnostico: item.obsDiagnostico || null,
          obsCotizacion: item.obsCotizacion || null,
          obsEjecucion: item.obsEjecucion || null,
          obsCalidad: item.obsCalidad || null,
          fechaCreacion: item.fechaCreacion || null,
          fechaIso: item.fechaIso || null,
          radicado: item.radicado || null,
          inventarioId: item.inventarioId || null,
          ventaId: item.ventaId || null,
          cotizacionId: item.cotizacionId || null,
          etapaActual: item.etapaActual || null,
          evidencias: item.evidencias || null,
          trazabilidad: item.trazabilidad || null,
          aplicaGarantia: item.aplicaGarantia ?? false,
          costoServicio: item.costoServicio ? parseFloat(item.costoServicio) : 0,
        };

        await tx.servicio.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });
      }
    }

    // --- FASE 3: Otras Tablas Planas ---

    // 9. Solicitudes Laborales
    if (diff.solicitudes) {
      await flatUpsert('solicitud', diff.solicitudes.upserted || []);
      await flatDelete('solicitud', diff.solicitudes.deleted || []);
    }

    // 10. Procesos Disciplinarios
    if (diff.procesosDisciplinarios) {
      await flatUpsert('procesoDisciplinario', diff.procesosDisciplinarios.upserted || []);
      await flatDelete('procesoDisciplinario', diff.procesosDisciplinarios.deleted || []);
    }

    // 11. Evaluaciones
    if (diff.evaluaciones) {
      await flatUpsert('evaluacion', diff.evaluaciones.upserted || []);
      await flatDelete('evaluacion', diff.evaluaciones.deleted || []);
    }

    // 12. Comunicados Oficiales (Anuncios)
    if (diff.anuncios) {
      await flatUpsert('anuncio', diff.anuncios.upserted || []);
      await flatDelete('anuncio', diff.anuncios.deleted || []);
    }

    // 13. Chat Interno
    if (diff.chat) {
      await flatUpsert('chat', diff.chat.upserted || []);
      await flatDelete('chat', diff.chat.deleted || []);
    }

    // 13.5 Grupos de Chat
    if (diff.chatGroups) {
      await flatUpsert('chatGroup', diff.chatGroups.upserted || []);
      await flatDelete('chatGroup', diff.chatGroups.deleted || []);
    }

    // 14. Auditoría
    if (diff.auditoria) {
      await flatUpsert('auditoria', diff.auditoria.upserted || []);
      await flatDelete('auditoria', diff.auditoria.deleted || []);
    }

    // 15. Notificaciones
    if (diff.notificaciones) {
      await flatUpsert('notificacion', diff.notificaciones.upserted || []);
      await flatDelete('notificacion', diff.notificaciones.deleted || []);
    }

    // 16. Comisionistas
    if (diff.comisionistas) {
      await flatUpsert('comisionista', diff.comisionistas.upserted || []);
      await flatDelete('comisionista', diff.comisionistas.deleted || []);
    }

    // 20. Cuentas de Cobro
    if (diff.cuentasCobro) {
      await flatDelete('cuentasCobro', diff.cuentasCobro.deleted || []);
      for (const item of diff.cuentasCobro.upserted || []) {
        const data = {
          ciudad: item.ciudad || null,
          fecha: item.fecha || null,
          cuenta: item.cuenta || null,
          nombre: item.nombre || null,
          cedula: item.cedula || null,
          correo: item.correo || null,
          concepto: item.concepto || null,
          items: item.items || null,
          nequi: item.nequi || null,
          titular: item.titular || null,
          estado: item.estado || null,
          total: item.total ? parseFloat(item.total) : 0,
        };

        await tx.cuentasCobro.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });
      }
    }

    // 17. PendingResets
    if (diff.pendingResets) {
      await flatUpsert('pendingReset', diff.pendingResets.upserted || []);
      await flatDelete('pendingReset', diff.pendingResets.deleted || []);
    }

    // 21. Capacitaciones
    if (diff.capacitaciones) {
      await flatUpsert('capacitacion', diff.capacitaciones.upserted || []);
      await flatDelete('capacitacion', diff.capacitaciones.deleted || []);
    }

    // 18. Configuración Global (WhatsApp e Informes)
    if (diff.config && diff.config.value) {
      const configVal = diff.config.value;
      
      if (configVal.whatsapp) {
        await tx.whatsappConfig.upsert({
          where: { id: 1 },
          update: { phone: configVal.whatsapp.phone, status: configVal.whatsapp.status },
          create: { id: 1, phone: configVal.whatsapp.phone, status: configVal.whatsapp.status },
        });
      }

      if (configVal.informes) {
        await tx.informesConfig.upsert({
          where: { id: 1 },
          update: { 
            margenOperativo: configVal.informes.margenOperativo,
            ingresoProyectos: configVal.informes.ingresoProyectos,
            gastosInstalacion: configVal.informes.gastosInstalacion,
            anticipos: configVal.informes.anticipos,
            gastosCajaChica: configVal.informes.gastosCajaChica,
            diasHabilesMes: configVal.informes.diasHabilesMes,
            mesPresupuesto: configVal.informes.mesPresupuesto,
            fechaCorte: configVal.informes.fechaCorte,
            diasTranscurridos: configVal.informes.diasTranscurridos
          },
          create: { 
            id: 1, 
            margenOperativo: configVal.informes.margenOperativo,
            ingresoProyectos: configVal.informes.ingresoProyectos,
            gastosInstalacion: configVal.informes.gastosInstalacion,
            anticipos: configVal.informes.anticipos,
            gastosCajaChica: configVal.informes.gastosCajaChica,
            diasHabilesMes: configVal.informes.diasHabilesMes,
            mesPresupuesto: configVal.informes.mesPresupuesto,
            fechaCorte: configVal.informes.fechaCorte,
            diasTranscurridos: configVal.informes.diasTranscurridos
          },
        });
      }
    }

    // Fin de la transacción
    }, {
      timeout: 30000 // 30s timeout para sincronizaciones grandes
    });

    // Determinar si SOLO se actualizó el chat (para evitar bloqueos en el frontend)
    let updateType = 'DB_UPDATE';
    const allTables = Object.keys(diff || {});
    
    // Si la solicitud modificó/eliminó algo, y TODAS las tablas modificadas son 'chat'
    if (allTables.length > 0 && allTables.every(t => t === 'chat')) {
      updateType = 'CHAT_UPDATE';
    }

    broadcastUpdate(updateType, diff);
    // 🛡️ Trazabilidad de Auditoría
    // NOTA: Se deshabilita el log genérico del backend porque el frontend 
    // ya genera logs específicos (logAudit) mucho más descriptivos.
    /*
    const actorUser = user || 'Sistema';
    for (const table of allTables) {
      if (diff[table]?.upserted && diff[table].upserted.length > 0) {
        await prisma.auditoria.create({
          data: {
            user: actorUser,
            fecha: new Date().toISOString(),
            action: 'UPDATE/INSERT',
            modulo: table,
            recordDetails: JSON.stringify(diff[table].upserted.map(i => i.id || i.doc || 'unknown'))
          }
        });
      }
      if (diff[table]?.deleted && diff[table].deleted.length > 0) {
        await prisma.auditoria.create({
          data: {
            user: actorUser,
            fecha: new Date().toISOString(),
            action: 'DELETE',
            modulo: table,
            recordDetails: JSON.stringify(diff[table].deleted)
          }
        });
      }
    }
    */

    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error("SYNC ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
        callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
});

function broadcastUpdate(type = 'DB_UPDATE', diff = null) {
  io.emit('db_update', { type, diff, timestamp: Date.now() });
}

const onlineUsers = new Map(); // socket.id -> username

function broadcastOnlineUsers() {
    const uniqueUsers = Array.from(new Set(onlineUsers.values()));
    io.emit('online_users', uniqueUsers);
}

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  
  // Enviar lista actual al nuevo cliente
  socket.emit('online_users', Array.from(new Set(onlineUsers.values())));

  socket.on('join_chat', async (data) => {
    if (data && data.user) {
      socket.join(data.user);
      onlineUsers.set(socket.id, data.user);
      broadcastOnlineUsers();
      console.log(`User ${data.user} joined personal room`);
      try {
        await prisma.user.updateMany({
          where: { user: data.user },
          data: { isOnline: true }
        });
        broadcastUpdate('DB_UPDATE');
      } catch (err) {
        console.error("Error setting isOnline true:", err);
      }
    }
  });

  socket.on('join_group', (groupId) => {
     socket.join(groupId);
     console.log(`Socket joined group ${groupId}`);
  });

  socket.on('send_message', (messageData) => {
    if (messageData.to === 'Todos') {
        socket.broadcast.emit('receive_message', messageData);
    } else if (messageData.to && messageData.to.startsWith('group_')) {
        socket.to(messageData.to).emit('receive_message', messageData);
    } else if (messageData.to) {
        socket.to(messageData.to).emit('receive_message', messageData);
    }
  });

  socket.on('send_nudge', (data) => {
     if (data.to) {
         if (data.to === 'Todos') socket.broadcast.emit('receive_nudge', data);
         else socket.to(data.to).emit('receive_nudge', data);
     }
  });

  socket.on('typing', (data) => {
     if (data.to) {
         socket.to(data.to).emit('typing', data);
     }
  });

  socket.on('disconnect', async () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    if (onlineUsers.has(socket.id)) {
        const username = onlineUsers.get(socket.id);
        onlineUsers.delete(socket.id);
        broadcastOnlineUsers();
        
        // Comprobar si el usuario tiene otras conexiones activas
        const isStillOnline = Array.from(onlineUsers.values()).includes(username);
        if (!isStillOnline) {
            try {
                await prisma.user.updateMany({
                    where: { user: username },
                    data: { isOnline: false }
                });
                broadcastUpdate('DB_UPDATE');
            } catch (err) {
                console.error("Error setting isOnline false:", err);
            }
        }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  verifySmtpConnection();
});
