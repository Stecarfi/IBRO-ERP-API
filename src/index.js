require('dotenv').config();
const prisma = require('./prisma');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { z } = require('zod');
const { validateSyncPayload } = require('./validators');
const { askGemini, geminiLogs } = require('./geminiService');
const { sendRecoveryEmail, verifySmtpConnection, sendLockoutEmail } = require('./emailService');

const path = require('path');
const app = express();
app.use(cookieParser());
const rateLimit = require('express-rate-limit');
const { setupCronJobs } = require('./cron/backup');

// Iniciar tareas en segundo plano
setupCronJobs();

// 🔒 CORS
app.use(cors()); // Permitir todo temporalmente

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
const avatarsDir = path.join(__dirname, 'public/avatars');
if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarsDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname);
        cb(null, req.body.username + '-' + uniqueSuffix + ext)
    }
});
const upload = multer({ storage: storage });

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
    try {
        const username = req.body.username;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        // Eliminar foto vieja de la memoria/disco
        const user = await prisma.user.findUnique({ where: { user: username } });
        if (user && user.foto) {
            try {
                const oldFileName = path.basename(user.foto);
                const oldFilePath = path.join(avatarsDir, oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            } catch (e) {
                console.error('Error deleting old avatar:', e);
            }
        }
        
        // Retornar nueva URL
        const newUrl = `${req.protocol}://${req.get('host')}/avatars/${req.file.filename}`;
        
        // Guardar URL real en la base de datos
        await prisma.user.update({
            where: { user: username },
            data: { foto: newUrl }
        });
        
        res.json({ url: newUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error uploading avatar' });
    }
});

app.delete('/api/remove-avatar', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await prisma.user.findUnique({ where: { user: username } });
        if (user && user.foto) {
            try {
                const oldFileName = path.basename(user.foto);
                const oldFilePath = path.join(avatarsDir, oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            } catch (e) {
                console.error('Error deleting avatar', e);
            }
            await prisma.user.update({
                where: { user: username },
                data: { foto: null }
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error removing avatar' });
    }
});

// Exponer archivos estáticos de la carpeta de avatares
app.use('/avatars', express.static(avatarsDir));

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

// TEMPORARY ENDPOINT TO WIPE DB FOR PRESENTATION
app.get('/api/wipe-db-2026', async (req, res) => {
  try {
    await prisma.auditoria.deleteMany({});
    await prisma.notificacion.deleteMany({});
    await prisma.chat.deleteMany({});
    await prisma.anuncio.deleteMany({});
    await prisma.evaluacion.deleteMany({});
    await prisma.procesoDisciplinario.deleteMany({});
    await prisma.solicitud.deleteMany({});
    await prisma.servicio.deleteMany({});
    await prisma.pQR.deleteMany({});
    await prisma.venta.deleteMany({});
    await prisma.cotizacion.deleteMany({});
    await prisma.cliente.deleteMany({});
    await prisma.inventario.deleteMany({});
    await prisma.comisionista.deleteMany({});
    res.json({ success: true, message: '¡Base de datos de producción limpiada con éxito!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de prueba de estado
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
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
    const dbUser = await prisma.user.findFirst({
      where: { user: { equals: user, mode: 'insensitive' } }
    });

    if (!dbUser) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (dbUser.isLocked) {
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
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { refreshToken }
      });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 // 15 min
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
      });

      return res.json({ success: true, user: dbUser });
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

  res.clearCookie('token');
  res.clearCookie('refreshToken');
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    res.status(403).json({ error: 'Refresh token expired' });
  }
});

// GET /api/gemini/test-key: Diagnosticar la clave de API activa
app.get('/api/gemini/test-key', (req, res) => {
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
app.get('/api/gemini/logs', (req, res) => {
  return res.json({
    logs: geminiLogs || []
  });
});

// GET /api/gemini/list-models: Listar modelos disponibles con la API Key actual
app.get('/api/gemini/list-models', async (req, res) => {
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
app.post('/api/gemini/chat', async (req, res) => {
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
      console.warn('[SMTP ERROR] Failed to send recovery email. Reset Link is:', resetLink);
      console.error(mailError);
      
      // Permitimos el retorno del enlace directamente en producción temporalmente para omitir fallos de SMTP
      return res.json({
        success: true,
        mockMode: true,
        resetLink: resetLink,
        message: 'No se pudo despachar el correo (El servicio de mensajería rechazó la petición). Aquí tienes tu enlace directo para restablecer la contraseña:'
      });
    }

    if (mailRes.mockMode) {
      return res.json({
        success: true,
        mockMode: true,
        resetLink: resetLink,
        message: 'Modo de prueba: enlace generado localmente.'
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
        user: dbUser.user,
        fecha: new Date().toLocaleString('es-ES'),
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

// GET /api/db: Carga el JSON global para el frontend mapeando relaciones
app.get('/api/db', async (req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' } });
    const clientes = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
    const inventario = await prisma.inventario.findMany({ orderBy: { id: 'asc' } });
    
    // Mapear Ventas (incluyendo Cliente y Producto)
    const ventasRaw = await prisma.venta.findMany({
      include: { cliente: true, producto: true },
      orderBy: { id: 'asc' }
    });
    const ventas = ventasRaw.map(v => ({
      id: v.id,
      fecha: v.fecha,
      fechaIso: v.fechaIso,
      venceGarantiaIso: v.venceGarantiaIso,
      mesesGarantia: v.mesesGarantia,
      vendedor: v.vendedor,
      docCli: v.cliente.doc,
      cliente: v.cliente.nom,
      idProd: v.productoId,
      producto: v.producto.ref,
      cant: v.cant,
      desc: v.desc,
      metodoPago: v.metodoPago,
      total: v.total,
      comisionistaId: v.comisionistaId,
      comisionistaNombre: v.comisionistaNombre,
      comisionistaPct: v.comisionistaPct,
      comisionistaValor: v.comisionistaValor,
      tipo_precio: v.tipo_precio,
      precioUnitario: v.precioUnitario,
      lockedBy: v.lockedBy,
      serialEquipo: v.serialEquipo
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
      fileData: p.fileData,
      estado: p.estado,
      satisfecho: p.satisfecho,
      lockedBy: p.lockedBy,
      radicado: p.radicado,
      hechos: p.hechos,
      solicitudes: p.solicitudes,
      evidencias: p.evidencias,
      aplicaGarantia: p.aplicaGarantia,
      tratamientoGarantia: p.tratamientoGarantia,
      terminoLegal: p.terminoLegal,
      fechaCierre: p.fechaCierre,
      inventarioId: p.inventarioId,
      ventaId: p.ventaId,
      cotizacionId: p.cotizacionId,
      trazabilidad: p.trazabilidad,
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
      evidencias: s.evidencias,
      trazabilidad: s.trazabilidad,
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
      fileData: s.fileData || null,
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
      include: { cliente: true, producto: true },
      orderBy: { id: 'asc' }
    });
    const cotizaciones = cotizacionesRaw.map(c => ({
      id: c.id,
      numCotizacion: c.numCotizacion,
      fecha: c.fecha,
      vendedor: c.vendedor,
      docCli: c.cliente.doc,
      cliente: c.cliente.nom,
      idProd: c.productoId,
      producto: c.producto.ref,
      cant: c.cant,
      desc: c.desc,
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
      vigencia: c.vigencia,
      ivaTipo: c.ivaTipo,
      equipos: c.equipos ? JSON.parse(c.equipos) : [],
      materiales: c.materiales ? JSON.parse(c.materiales) : [],
      tipo_precio: c.tipo_precio,
      precioUnitario: c.precioUnitario,
      fechaSeguimiento: c.fechaSeguimiento,
      estadoSeguimiento: c.estadoSeguimiento,
      motivoSeguimiento: c.motivoSeguimiento,
      motivoNoCompra: c.motivoNoCompra
    }));

    const chat = await prisma.chat.findMany({ orderBy: { timestamp: 'asc' } });
    const auditoria = await prisma.auditoria.findMany({ orderBy: { id: 'asc' } });
    const notificaciones = await prisma.notificacion.findMany({ orderBy: { id: 'asc' } });
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
    const whatsappConfig = config ? { phone: config.phone, status: config.status } : { phone: '573000000000', status: 'Activo' };

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
      chat,
      auditoria,
      notificaciones,
      comisionistas,
      whatsappConfig,
      pendingResets
    });
  } catch (error) {
    console.error('Error fetching database:', error);
    res.status(500).json({ error: 'Error al cargar la base de datos', details: error.message });
  }
});

// POST /api/location/update: Reportar ubicación en tiempo real
app.post('/api/location/update', async (req, res) => {
  const { user, lat, lng } = req.body;
  if (!user || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Faltan datos de ubicación' });
  }

  try {
    await prisma.user.update({
      where: { user: user },
      data: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        lastLocationUpdate: Date.now()
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error actualizando ubicación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/location/users: Obtener la ubicación de todos los usuarios
app.get('/api/location/users', async (req, res) => {
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

// POST /api/db/sync: Procesa el diff incremental del cliente
app.post('/api/db/sync', async (req, res) => {
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
    // Helper para upserts en tablas planas directas
    const flatUpsert = async (table, items) => {
      for (const item of items) {
        const { ...data } = item;

        if (table === 'user') {
          // Ya permitimos que foto se guarde y sincronice
        }

        // Evitar conflictos por llaves únicas (como doc en Clientes o user en Usuarios)
        if (table === 'cliente' && item.doc) {
          const existing = await prisma.cliente.findUnique({ where: { doc: item.doc } });
          if (existing) {
            delete data.id;
            await prisma.cliente.update({
              where: { id: existing.id },
              data
            });
            continue;
          }
        }

        if (table === 'user' && item.user) {
          const existing = await prisma.user.findUnique({ where: { user: item.user } });
          if (existing) {
            delete data.id;
            if (data.pass) {
              const isBcrypt = data.pass.startsWith('$2a$') || data.pass.startsWith('$2b$') || data.pass.startsWith('$2y$');
              if (!isBcrypt) {
                data.pass = bcrypt.hashSync(data.pass, 10);
              }
            }
            await prisma.user.update({
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

        await prisma[table].upsert({
          where: { id: item.id },
          update: data,
          create: data,
        });
      }
    };

    // Helper para eliminaciones en tablas planas directas
    const flatDelete = async (table, ids) => {
      if (ids && ids.length > 0) {
        await prisma[table].deleteMany({
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
        // Encontrar Cliente por su documento (docCli)
        const client = await prisma.cliente.findUnique({ where: { doc: item.docCli } });
        // Encontrar Producto por su idProd o su referencia
        const product = await prisma.inventario.findFirst({
          where: { OR: [{ id: item.idProd }, { ref: item.producto }] }
        });

        if (!client || !product) {
          console.error(`Sync Venta ${item.id} fallida: Cliente (${item.docCli}) o Producto (${item.idProd}) no encontrado.`);
          continue;
        }

        const data = {
          fecha: item.fecha,
          fechaIso: item.fechaIso,
          venceGarantiaIso: item.venceGarantiaIso,
          mesesGarantia: parseInt(item.mesesGarantia) || 0,
          vendedor: item.vendedor,
          clienteId: client.id,
          productoId: product.id,
          cant: parseInt(item.cant) || 0,
          desc: parseFloat(item.desc) || 0,
          metodoPago: item.metodoPago || 'Efectivo',
          total: parseFloat(item.total) || 0,
          comisionistaId: item.comisionistaId || null,
          comisionistaNombre: item.comisionistaNombre || null,
          comisionistaPct: item.comisionistaPct ? parseFloat(item.comisionistaPct) : null,
          comisionistaValor: item.comisionistaValor ? parseFloat(item.comisionistaValor) : null,
          tipo_precio: item.tipo_precio || null,
          precioUnitario: item.precioUnitario ? parseFloat(item.precioUnitario) : null,
          lockedBy: item.lockedBy || null,
          serialEquipo: item.serialEquipo || null,
        };

        await prisma.venta.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });
      }
    }

    // 6. Cotizaciones
    if (diff.cotizaciones) {
      await flatDelete('cotizacion', diff.cotizaciones.deleted || []);

      for (const item of diff.cotizaciones.upserted || []) {
        const client = await prisma.cliente.findUnique({ where: { doc: item.docCli } });
        // Since idProd might be a dummy or manual value, we fall back safely
        let product = await prisma.inventario.findFirst({
          where: { OR: [{ id: item.idProd }, { ref: item.producto }] }
        });

        // Backwards compatibility fallback if product is not found (e.g. legacy or manual product)
        if (!product) {
          // Find first product in DB to link, or create a dummy relation if needed.
          // In most database environments we need to satisfy foreign key constraint.
          product = await prisma.inventario.findFirst();
        }

        if (!client || !product) {
          console.error(`Sync Cotizacion ${item.id} fallida: Cliente o Producto no encontrado.`);
          continue;
        }

        const data = {
          numCotizacion: item.numCotizacion || null,
          fecha: item.fecha,
          vendedor: item.vendedor,
          clienteId: client.id,
          productoId: product.id,
          cant: parseInt(item.cant) || 0,
          desc: parseFloat(item.desc) || 0,
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
          vigencia: item.vigencia ? parseInt(item.vigencia) : 10,
          ivaTipo: item.ivaTipo || "exento",
          equipos: item.equipos ? JSON.stringify(item.equipos) : null,
          materiales: item.materiales ? JSON.stringify(item.materiales) : null,
          tipo_precio: item.tipo_precio || null,
          precioUnitario: item.precioUnitario ? parseFloat(item.precioUnitario) : null,
          fechaSeguimiento: item.fechaSeguimiento || null,
          estadoSeguimiento: item.estadoSeguimiento || null,
          motivoSeguimiento: item.motivoSeguimiento || null,
          motivoNoCompra: item.motivoNoCompra || null
        };

        await prisma.cotizacion.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });
      }
    }

    // 7. PQRS
    if (diff.pqrs) {
      await flatDelete('pQR', diff.pqrs.deleted || []);

      for (const item of diff.pqrs.upserted || []) {
        const client = await prisma.cliente.findUnique({ where: { doc: item.docCli } });
        if (!client) {
          console.error(`Sync PQR ${item.id} fallida: Cliente con doc ${item.docCli} no encontrado.`);
          continue;
        }

        const data = {
          fecha: item.fecha,
          limiteIso: item.limiteIso,
          clienteId: client.id,
          tipo: item.tipo,
          detalle: item.detalle,
          evidencia: item.evidencia || null,
          fileData: item.fileData || null,
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

        await prisma.pQR.upsert({
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
        const client = await prisma.cliente.findUnique({ where: { doc: item.docCli } });
        if (!client) {
          console.error(`Sync Servicio ${item.id} fallida: Cliente con doc ${item.docCli} no encontrado.`);
          continue;
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

        await prisma.servicio.upsert({
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

    // 17. PendingResets
    if (diff.pendingResets) {
      await flatUpsert('pendingReset', diff.pendingResets.upserted || []);
      await flatDelete('pendingReset', diff.pendingResets.deleted || []);
    }

    // 18. Configuración WhatsApp (Objeto Único)
    if (diff.whatsappConfig && diff.whatsappConfig.value) {
      const val = diff.whatsappConfig.value;
      await prisma.whatsappConfig.upsert({
        where: { id: 1 },
        update: { phone: val.phone, status: val.status },
        create: { id: 1, phone: val.phone, status: val.status },
      });
    }

    broadcastUpdate();
    // 🛡️ Trazabilidad de Auditoría
    const actorUser = user || 'Sistema';
    if (Object.keys(diff.updated || {}).length > 0) {
      for (const table of Object.keys(diff.updated)) {
        await prisma.auditoria.create({
          data: {
            user: actorUser,
            fecha: new Date().toISOString(),
            action: 'UPDATE/INSERT',
            modulo: table,
            recordDetails: JSON.stringify(diff.updated[table].map(i => i.id || i.doc || 'unknown'))
          }
        });
      }
    }
    if (Object.keys(diff.deleted || {}).length > 0) {
      for (const table of Object.keys(diff.deleted)) {
        await prisma.auditoria.create({
          data: {
            user: actorUser,
            fecha: new Date().toISOString(),
            action: 'DELETE',
            modulo: table,
            recordDetails: JSON.stringify(diff.deleted[table])
          }
        });
      }
    }

    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error('Error syncing database:', error);
    res.status(500).json({ error: 'Error al sincronizar la base de datos', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });
});

function broadcastUpdate() {
  const msg = JSON.stringify({ type: 'DB_UPDATE', timestamp: Date.now() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      
      try {
        client.send(msg);
      } catch (err) {
        console.error('Error sending WS message:', err);
      }
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  verifySmtpConnection();
});
