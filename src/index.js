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
const { validateSyncPayload, sanitizeBackendForPrisma, safeDate, safeJson } = require('./validators');
const { askGemini, geminiLogs } = require('./geminiService');
const { sendRecoveryEmail, verifySmtpConnection, sendLockoutEmail } = require('./emailService');
const driveService = require('./services/drive.service');

const path = require('path');
const app = express();
let io; // Instancia global de Socket.io
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

const optionalAuthenticateToken = (req, res, next) => {
  const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].split(' ')[1] : null);
  if (!token) return next();

  jwt.verify(token, process.env.JWT_SECRET || 'ibro_fallback_secret_2026', (err, user) => {
    if (!err) req.user = user;
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
        const username = req.body.username || req.user?.user;
        if (!username) return res.status(400).json({ error: 'Username required' });
        if (!req.file) return res.status(400).json({ error: 'No avatar file provided' });
        
        if (!driveService.isAvailable()) {
            return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para almacenar avatares.' });
        }

        // 1. Eliminar foto anterior si era de Drive
        const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
        if (user && user.foto && user.foto.includes('drive.google.com')) {
            try {
                await driveService.deleteByUrl(user.foto);
            } catch (driveDelErr) {
                console.error('[UPLOAD-AVATAR] Error al eliminar avatar anterior de Drive:', driveDelErr.message);
            }
        }
        
        // 2. Subir nuevo avatar directamente a Drive en Usuarios/user_{id}
        const userFolder = `user_${user?.id || username}`;
        const newUrl = await driveService.uploadFile(
            req.file.buffer, 
            req.file.originalname, 
            req.file.mimetype,
            ['Usuarios', userFolder]
        );
        
        // 3. Guardar URL en la base de datos
        await prisma.user.updateMany({
            where: { user: { equals: username, mode: 'insensitive' } },
            data: { foto: newUrl }
        });
        
        broadcastUpdate('DB_UPDATE');
        res.json({ url: newUrl });
    } catch (error) {
        console.error('[UPLOAD-AVATAR] Error:', error);
        res.status(500).json({ error: error.message || 'Error uploading avatar to Google Drive' });
    }
});

const uploadEvidence = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
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

        if (!driveService.isAvailable()) {
            return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para almacenar evidencias.' });
        }

        const rawModule = req.body.modulo || req.body.module || 'Servicios';
        const moduleFolder = rawModule.charAt(0).toUpperCase() + rawModule.slice(1).toLowerCase();
        const caseId = req.body.serviceId || req.body.servicioId || req.body.pqrsId || req.body.id || 'general';
        const folderSegments = [moduleFolder, `caso_${caseId}`];

        const urls = [];
        for (const file of req.files) {
            const driveUrl = await driveService.uploadFile(
                file.buffer, 
                file.originalname, 
                file.mimetype,
                folderSegments
            );
            urls.push(driveUrl);
        }

        res.json({ urls });
    } catch (error) {
        console.error('[UPLOAD-EVIDENCE] Error:', error);
        res.status(500).json({ error: error.message || 'Error uploading evidence to Google Drive' });
    }
});

app.delete('/api/remove-avatar', authenticateToken, async (req, res) => {
    try {
        const username = req.body.username || req.user?.user;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        const user = await prisma.user.findFirst({ where: { user: { equals: username, mode: 'insensitive' } } });
        if (user && user.foto) {
            if (user.foto.includes('drive.google.com')) {
                try {
                    await driveService.deleteByUrl(user.foto);
                } catch (driveDelErr) {
                    console.error('[REMOVE-AVATAR] Error al eliminar avatar de Drive:', driveDelErr.message);
                }
            } else {
                try {
                    const oldFileName = path.basename(user.foto);
                    const oldFilePath = path.join(uploadsDir, oldFileName);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                } catch (e) {
                    console.error('[REMOVE-AVATAR] Error al eliminar avatar local:', e.message);
                }
            }
        }
        
        await prisma.user.updateMany({
            where: { user: { equals: username, mode: 'insensitive' } },
            data: { foto: null }
        });
        broadcastUpdate('DB_UPDATE');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error removing avatar' });
    }
});

// Endpoint dedicado para firma digital del asesor
app.post('/api/upload-signature', authenticateToken, async (req, res) => {
    try {
        const { username, signature } = req.body;
        const targetUser = username || req.user?.user;
        if (!targetUser) return res.status(400).json({ error: 'Username required' });
        if (!signature || typeof signature !== 'string') {
            return res.status(400).json({ error: 'Signature data is required' });
        }

        await prisma.user.updateMany({
            where: { user: { equals: targetUser, mode: 'insensitive' } },
            data: { firma: signature }
        });

        broadcastUpdate('DB_UPDATE');
        res.json({ success: true, firma: signature });
    } catch (error) {
        console.error('Error uploading signature:', error);
        res.status(500).json({ error: 'Error uploading signature' });
    }
});

app.delete('/api/remove-signature', authenticateToken, async (req, res) => {
    try {
        const { username } = req.body;
        const targetUser = username || req.user?.user;
        if (!targetUser) return res.status(400).json({ error: 'Username required' });

        await prisma.user.updateMany({
            where: { user: { equals: targetUser, mode: 'insensitive' } },
            data: { firma: '' }
        });

        broadcastUpdate('DB_UPDATE');
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing signature:', error);
        res.status(500).json({ error: 'Error removing signature' });
    }
});

// Endpoint genérico de subida de archivos (Evidencias de PQRS, Solicitudes, etc.)
app.post('/api/upload', authenticateToken, upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (!driveService.isAvailable()) {
            return res.status(503).json({ error: 'El servicio de Google Drive no está disponible.' });
        }

        const targetFolder = req.body.folder || 'General';
        const folderSegments = [targetFolder];

        const uploadedFiles = [];
        for (const file of req.files) {
            const driveUrl = await driveService.uploadFile(file.buffer, file.originalname, file.mimetype, folderSegments);
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
        res.status(500).json({ error: error.message || 'Error uploading files to Google Drive' });
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

app.post('/api/upload-course-material', authenticateToken, uploadCourseMaterial.array('materiales', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (!driveService.isAvailable()) {
            return res.status(503).json({ error: 'El servicio de Google Drive no está disponible para materiales de capacitación.' });
        }

        const courseId = req.body.courseId || req.body.cursoId || 'general';
        const folderSegments = ['Capacitaciones', `curso_${courseId}`];

        const uploadedMaterials = [];
        for (const file of req.files) {
            const fileUrl = await driveService.uploadDocument(file.buffer, file.originalname, file.mimetype, folderSegments);

            uploadedMaterials.push({
                nombre: file.originalname,
                url: fileUrl,
                tamano: file.size,
                mimetype: file.mimetype
            });
        }

        res.json({ 
            success: true, 
            materials: uploadedMaterials, 
            urls: uploadedMaterials.map(m => m.url) 
        });
    } catch (error) {
        console.error('[UPLOAD-COURSE] Error:', error);
        res.status(500).json({ error: error.message || 'Error uploading course material to Google Drive' });
    }
});

// Endpoint proxy/streaming para transmitir archivos de Google Drive sin restricciones de CORS ni login
app.get('/api/drive-stream/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) return res.status(400).json({ error: 'fileId es requerido' });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');

        // 1. Intentar streaming autenticado si driveService está activo
        if (driveService && typeof driveService.isAvailable === 'function' && driveService.isAvailable()) {
            try {
                let meta = null;
                try {
                    const metaRes = await driveService.drive.files.get({
                        fileId: fileId,
                        fields: 'id, name, mimeType, size',
                        supportsAllDrives: true
                    });
                    meta = metaRes.data;
                } catch (mErr) {
                    console.warn('[DRIVE-STREAM] Metadatos no disponibles:', mErr.message);
                }

                const driveStream = await driveService.drive.files.get(
                    { fileId: fileId, alt: 'media', supportsAllDrives: true },
                    { responseType: 'stream' }
                );

                res.setHeader('Content-Type', meta?.mimeType || 'application/pdf');
                if (meta?.size) res.setHeader('Content-Length', meta.size);
                if (meta?.name) res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.name)}"`);
                return driveStream.data.pipe(res);
            } catch (authErr) {
                console.warn('[DRIVE-STREAM] Intento con service account falló, usando descarga directa de respaldo:', authErr.message);
            }
        }

        // 2. Respaldo universal directo para enlaces de Google Drive públicos o compartidos
        const directDriveUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
        const fetchRes = await fetch(directDriveUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!fetchRes.ok) {
            return res.status(fetchRes.status).json({ error: 'No se pudo descargar el archivo desde Google Drive' });
        }

        const contentType = fetchRes.headers.get('content-type') || 'application/pdf';
        const contentLength = fetchRes.headers.get('content-length');

        res.setHeader('Content-Type', contentType.includes('text/html') ? 'application/pdf' : contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        res.setHeader('Content-Disposition', `inline; filename="documento-${fileId}.pdf"`);

        const arrayBuffer = await fetchRes.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('[DRIVE-STREAM] Error al transmitir archivo desde Drive:', err.message);
        res.status(500).json({ error: 'Error al transmitir archivo desde Drive' });
    }
});

// Endpoint para reconocimiento y validación automática de duración de videos de YouTube
app.get('/api/youtube-duration', async (req, res) => {
    try {
        const rawUrl = req.query.url || req.query.videoId || '';
        if (!rawUrl || typeof rawUrl !== 'string') {
            return res.status(400).json({ error: 'url o videoId es requerido' });
        }

        let videoId = rawUrl.trim();
        const m = videoId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
        if (m) videoId = m[1];

        if (!videoId || videoId.length !== 11) {
            return res.status(400).json({ error: 'ID o URL de video de YouTube inválido' });
        }

        const https = require('https');
        const fetchPromise = new Promise((resolve) => {
            const ytReq = https.get('https://www.youtube.com/watch?v=' + videoId, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
                }
            }, (ytRes) => {
                let data = '';
                ytRes.on('data', chunk => data += chunk);
                ytRes.on('end', () => {
                    let totalSecs = 0;
                    const m1 = data.match(/"approxDurationMs":"(\d+)"/);
                    if (m1) {
                        totalSecs = Math.round(parseInt(m1[1], 10) / 1000);
                    } else {
                        const m2 = data.match(/"lengthSeconds":"(\d+)"/);
                        if (m2) {
                            totalSecs = parseInt(m2[1], 10);
                        } else {
                            const m3 = data.match(/itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/);
                            if (m3) {
                                const h = parseInt(m3[1] || '0', 10);
                                const min = parseInt(m3[2] || '0', 10);
                                const s = parseInt(m3[3] || '0', 10);
                                totalSecs = h * 3600 + min * 60 + s;
                            }
                        }
                    }

                    if (totalSecs > 0) {
                        const mins = Math.floor(totalSecs / 60);
                        const secs = totalSecs % 60;
                        const formatted = mins > 0 ? `${mins} min ${secs} s` : `${secs} s`;
                        return resolve({
                            success: true,
                            videoId,
                            seconds: totalSecs,
                            minutes: Math.ceil(totalSecs / 60),
                            formatted
                        });
                    }

                    resolve({ success: false, error: 'No se pudo detectar la duración del video de YouTube' });
                });
            });

            ytReq.on('error', (err) => resolve({ success: false, error: err.message }));
            ytReq.setTimeout(6000, () => {
                ytReq.destroy();
                resolve({ success: false, error: 'Tiempo de espera agotado al consultar YouTube' });
            });
        });

        const result = await fetchPromise;
        if (!result.success) {
            return res.status(422).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('[YOUTUBE-DURATION] Error:', err);
        res.status(500).json({ error: 'Error interno al consultar duración de YouTube' });
    }
});

// Endpoint administrativo para reiniciar capacitación a un usuario (Requisito 6 y 7)
app.post('/api/capacitaciones/:id/reset-user', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, razon } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId es requerido para reiniciar el curso' });
        }

        const callerUser = req.user;
        const callerDb = await prisma.user.findFirst({
            where: { user: callerUser.user },
            include: { role: true }
        });

        const isAdmin = callerDb?.roleId === '1' || callerDb?.user === 'admin' || callerDb?.user === 'stecarfi05' || callerDb?.role?.name?.toLowerCase().includes('admin') || callerDb?.role?.name?.toLowerCase().includes('gerente');
        if (!isAdmin) {
            return res.status(403).json({ error: 'No tienes permisos de administrador para reiniciar capacitaciones' });
        }

        const cap = await prisma.capacitacion.findUnique({ where: { id } });
        if (!cap) {
            return res.status(404).json({ error: 'Capacitación no encontrada' });
        }

        const asistentes = Array.isArray(cap.asistentes) ? [...cap.asistentes] : [];
        const idx = asistentes.findIndex(a => a.userId === userId || String(a.userId).toLowerCase() === String(userId).toLowerCase());

        let isNewAssignment = false;
        let prevCiclo = 1;

        if (idx === -1) {
            // Usuario no estaba asignado: registrar nueva asignación oficial
            isNewAssignment = true;
            const targetUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        { id: userId },
                        { user: userId }
                    ]
                }
            });

            const newAsistente = {
                userId: targetUser ? targetUser.user : userId,
                nombre: targetUser ? `${targetUser.nombre || ''} ${targetUser.apellido || ''}`.trim() || targetUser.user : userId,
                cargo: targetUser?.cargo || 'Colaborador',
                estado: 'En progreso',
                asistenciaConfirmada: true,
                lecturaCompletada: false,
                videoCompletado: false,
                evaluacionPresentada: false,
                score: null,
                correctCount: null,
                totalCount: null,
                ciclo: 1,
                fechaInicio: new Date().toISOString(),
                fechaAsignacion: new Date().toISOString(),
                asignadoPor: callerUser.user,
                razon: razon || 'Asignación formal de capacitación por administración'
            };
            asistentes.push(newAsistente);
        } else {
            // Usuario ya registrado: archivar intento en historial e iniciar nuevo ciclo formativo
            const prevData = asistentes[idx];
            prevCiclo = prevData.ciclo || 1;
            const prevHistory = Array.isArray(prevData.historialCiclos) ? [...prevData.historialCiclos] : [];

            prevHistory.push({
                ciclo: prevCiclo,
                estadoFinal: prevData.estado || 'Reprobado',
                score: prevData.score ?? null,
                correctCount: prevData.correctCount ?? null,
                totalCount: prevData.totalCount ?? null,
                fechaEvaluacion: prevData.fechaEvaluacion || null,
                fechaReinicio: new Date().toISOString(),
                reiniciadoPor: callerUser.user,
                razon: razon || 'Reinicio autorizado por administración para nueva oportunidad formativa'
            });

            asistentes[idx] = {
                ...prevData,
                estado: 'En progreso',
                asistenciaConfirmada: true,
                lecturaCompletada: false,
                videoCompletado: false,
                bloqueadoPorReprobacion: false,
                evaluacionPresentada: false,
                score: null,
                correctCount: null,
                totalCount: null,
                fechaEvaluacion: null,
                ciclo: prevCiclo + 1,
                fechaReinicio: new Date().toISOString(),
                reiniciadoPor: callerUser.user,
                historialCiclos: prevHistory
            };
        }

        const updatedCap = await prisma.capacitacion.update({
            where: { id },
            data: { asistentes }
        });

        // Registrar en Auditoría formal
        try {
            await prisma.auditoria.create({
                data: {
                    userId: callerDb.id,
                    fecha: new Date(),
                    action: isNewAssignment ? 'ASIGNACION_CAPACITACION' : 'REINICIO_CAPACITACION',
                    modulo: 'capacitaciones',
                    recordDetails: isNewAssignment
                        ? `Asignación de curso "${cap.tema}" para el colaborador ${userId}. Motivo: ${razon || 'Asignación administrativa'}`
                        : `Reinicio de curso "${cap.tema}" para el colaborador ${userId} (Ciclo ${prevCiclo + 1}). Motivo: ${razon || 'Solicitud de nueva oportunidad'}`,
                    shadowingData: {
                        capacitacionId: id,
                        tema: cap.tema,
                        targetUserId: userId,
                        nuevoCiclo: isNewAssignment ? 1 : prevCiclo + 1,
                        adminUser: callerUser.user,
                        isNewAssignment
                    }
                }
            });
        } catch (auditErr) {
            console.warn('[AUDIT ERROR] No se pudo guardar auditoría de capacitación:', auditErr.message);
        }

        // Notificar en tiempo real por Socket.io si está disponible
        if (io) {
            io.emit('DB_UPDATE', { module: 'capacitaciones' });
        }

        return res.json({
            success: true,
            isNewAssignment,
            message: isNewAssignment
                ? `Curso "${cap.tema}" asignado exitosamente a ${userId}.`
                : `Curso reiniciado exitosamente para ${userId}. El colaborador ha avanzado al Ciclo ${prevCiclo + 1}.`,
            capacitacion: updatedCap
        });
    } catch (error) {
        console.error('[RESET/ASSIGN-CAPACITACION] Error:', error);
        return res.status(500).json({ error: 'Error al procesar asignación/reinicio de curso: ' + error.message });
    }
});

// Alias para asignación directa de cursos a colaboradores
app.post('/api/capacitaciones/:id/assign-user', authenticateToken, async (req, res) => {
    // Redirige al handler unificado de asignación / reinicio
    return app._router.handle({ ...req, url: `/api/capacitaciones/${req.params.id}/reset-user` }, res);
});

// Endpoint directo para eliminar capacitaciones por ID (Requisito 1)
app.delete('/api/capacitaciones/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const callerUser = req.user;
        const callerDb = await prisma.user.findFirst({
            where: { user: callerUser.user },
            include: { role: true }
        });

        const isAdmin = callerDb?.roleId === '1' || callerDb?.user === 'admin' || callerDb?.user === 'stecarfi05' || callerDb?.role?.name?.toLowerCase().includes('admin') || callerDb?.role?.name?.toLowerCase().includes('gerente');
        if (!isAdmin) {
            return res.status(403).json({ error: 'No tienes permisos de administrador para eliminar capacitaciones' });
        }

        const cap = await prisma.capacitacion.findUnique({ where: { id } });
        if (!cap) {
            return res.status(404).json({ error: 'Capacitación no encontrada' });
        }

        await prisma.capacitacion.delete({ where: { id } });

        try {
            await prisma.auditoria.create({
                data: {
                    userId: callerDb.id,
                    fecha: new Date(),
                    action: 'ELIMINAR_CAPACITACION',
                    modulo: 'capacitaciones',
                    recordDetails: `Eliminación de la capacitación "${cap.tema}" (ID: ${id})`,
                    shadowingData: { capacitacionId: id, tema: cap.tema, adminUser: callerUser.user }
                }
            });
        } catch (auditErr) {
            console.warn('[AUDIT ERROR] No se pudo guardar auditoría:', auditErr.message);
        }

        if (io) {
            io.emit('DB_UPDATE', { module: 'capacitaciones' });
        }

        return res.json({ success: true, message: 'Capacitación eliminada exitosamente' });
    } catch (err) {
        console.error('[CAPACITACIONES-DELETE] Error:', err);
        return res.status(500).json({ error: 'Error al eliminar la capacitación: ' + err.message });
    }
});

// Endpoint para registrar eventos de avance y auditoría de capacitaciones (Requisito 8)
app.post('/api/capacitaciones/:id/log-event', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { eventType, details } = req.body;
        const user = req.user;

        const userDb = await prisma.user.findFirst({ where: { user: user.user } });
        if (!userDb) return res.status(404).json({ error: 'Usuario no encontrado' });

        await prisma.auditoria.create({
            data: {
                userId: userDb.id,
                fecha: new Date(),
                action: eventType || 'EVENTO_CAPACITACION',
                modulo: 'capacitaciones',
                recordDetails: details || `Evento en capacitación ID ${id}`,
                shadowingData: { capacitacionId: id, user: user.user, details }
            }
        });

        res.json({ success: true });
    } catch (e) {
        console.error('[LOG-CAPACITACION-EVENT] Error:', e.message);
        res.status(500).json({ error: e.message });
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
        await sendLockoutEmail(dbUser.correo, `${dbUser.nombre} ${dbUser.apellido || ''}`.trim(), resetLink);
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
        userId: dbUser.id,
        token: verificationCode,
        expire: new Date(Date.now() + 3600000)
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
      // Incluso en mock mode devolvemos el resetLink para desarrollo y pruebas
      return res.json({
        success: true,
        resetLink: resetLink,
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
        user: { user: { equals: user, mode: 'insensitive' } },
        token: token
      }
    });

    if (!pending) {
      return res.status(400).json({ error: 'El código de seguridad o usuario es incorrecto.' });
    }

    if (new Date(pending.expire) < new Date()) {
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
    const rawData = req.body;
    const cleanData = sanitizeBackendForPrisma('informesConfig', rawData);
    delete cleanData.id;

    const existing = await prisma.informesConfig.findUnique({ where: { id: 1 } });
    if (existing) {
      await prisma.informesConfig.update({ where: { id: 1 }, data: cleanData });
    } else {
      await prisma.informesConfig.create({ data: { id: 1, ...cleanData } });
    }
    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error('Error saving informes config:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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
        lastLogin: true, isOnline: true, foto: true, firma: true, lat: true, lng: true,
        lastLocationUpdate: true, codigoAsesor: true
      },
      orderBy: { id: 'asc' }
    });
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' } });
    const clientesRaw = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
    const clientes = clientesRaw.map(c => {
      let dVal = '', mVal = '', aVal = '';
      if (c.fechaVinculacion) {
        if (typeof c.fechaVinculacion === 'string' && c.fechaVinculacion.includes('/')) {
          const pts = c.fechaVinculacion.split('/');
          dVal = pts[0]; mVal = pts[1]; aVal = pts[2];
        } else {
          const isoDate = c.fechaVinculacion instanceof Date 
            ? c.fechaVinculacion.toISOString().split('T')[0] 
            : String(c.fechaVinculacion).split('T')[0];
          if (isoDate.includes('-')) {
            const parts = isoDate.split('-');
            aVal = parts[0];
            mVal = parts[1];
            dVal = parts[2];
          }
        }
      }

      // Resolver asesor de forma automática
      const advisorUser = users.find(u => 
        (c.asesorNombre && `${u.nombre || ''} ${u.apellido || ''}`.trim().toLowerCase() === c.asesorNombre.trim().toLowerCase()) ||
        (c.owner && u.user?.toLowerCase() === c.owner.toLowerCase())
      );
      const asesorCedula = c.asesorCedula || advisorUser?.cedula || advisorUser?.id || '';
      const asesorCodigo = c.asesorCodigo || advisorUser?.codigoAsesor || '';
      const asesorNombre = c.asesorNombre || (advisorUser ? `${advisorUser.nombre || ''} ${advisorUser.apellido || ''}`.trim() : '');
      const asesorCargo = c.asesorCargo || advisorUser?.cargo || advisorUser?.rol || 'Administrador Master';
      const asesorEmail = c.asesorEmail || advisorUser?.correo || advisorUser?.email || '';

      return {
        ...c,
        dia: dVal,
        mes: mVal,
        anio: aVal,
        fechaVinculacion: dVal && mVal && aVal ? `${dVal}/${mVal}/${aVal}` : (c.fechaVinculacion || ''),
        asesorCedula,
        asesorCodigo,
        asesorNombre,
        asesorCargo,
        asesorEmail
      };
    });
    const inventarioRaw = await prisma.inventario.findMany({ orderBy: { id: 'asc' } });
    const inventario = inventarioRaw.map(inv => {
      const ext = (inv.datosExt && typeof inv.datosExt === 'object') ? inv.datosExt : {};
      return {
        ...inv,
        ...ext
      };
    });
    
    // Mapear Ventas (incluyendo Cliente y Producto)
    const ventasRaw = await prisma.venta.findMany({
      take: 50,
      include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
      orderBy: { id: 'desc' }
    });
    ventasRaw.reverse();
    const ventas = ventasRaw.map(v => {
      const meta = (v.equipos && typeof v.equipos === 'object' && !Array.isArray(v.equipos) && v.equipos._meta) ? v.equipos._meta : {};
      const equiposList = (v.equipos && typeof v.equipos === 'object' && !Array.isArray(v.equipos) && Array.isArray(v.equipos.items)) ? v.equipos.items : (Array.isArray(v.equipos) ? v.equipos : []);

      return {
        id: v.id,
        fecha: v.fecha,
        fechaIso: v.fechaIso,
        venceGarantiaIso: v.venceGarantiaIso,
        mesesGarantia: v.mesesGarantia,
        vendedor: v.vendedor?.user || '',
        vendedorId: v.vendedorId,
        clienteId: v.clienteId,
        docCli: v.cliente?.doc || meta.clienteNit || '',
        cliente: v.cliente?.nom || meta.clienteNombre || '',
        clienteNombre: meta.clienteNombre || v.cliente?.nom || '',
        clienteNit: meta.clienteNit || v.cliente?.doc || '',
        clienteDireccion: meta.clienteDireccion || v.cliente?.direccion || '',
        clienteTelefono: meta.clienteTelefono || v.cliente?.tel || '',
        clienteEmail: meta.clienteEmail || v.cliente?.correo || '',
        items: v.items.map(i => ({
          productoId: i.productoId,
          producto: i.producto?.ref || '',
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
        vendedorNombre: v.vendedorNombre || v.vendedor?.nombre || '',
        vendedorCargo: v.vendedorCargo || v.vendedor?.cargo || '',
        vendedorEmail: v.vendedorEmail || v.vendedor?.correo || '',
        vendedorMovil: v.vendedorMovil || v.vendedor?.telefono || '',
        vendedorCodigoAsesor: v.vendedorCodigoAsesor || v.vendedor?.codigoAsesor || '',
        equipos: equiposList,
        materiales: v.materiales || [],
        numPedido: meta.numPedido || (v.id.startsWith('PED-') ? v.id : 'PED-' + v.id.slice(-4)),
        ...meta
      };
    });

    // Mapear PQRS
    const pqrsRaw = await prisma.pQR.findMany({
      include: { cliente: true, usuarioAsignado: true },
      orderBy: { id: 'asc' }
    });
    const pqrs = pqrsRaw.map(p => ({
      id: p.id,
      clienteId: p.clienteId,
      fecha: p.fecha,
      limiteIso: p.limiteIso,
      docCli: p.cliente?.doc || '',
      cliente: p.cliente?.nom || '',
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
      evidencias: typeof p.evidencias === 'string' ? p.evidencias : JSON.stringify(p.evidencias || []),
      aplicaGarantia: p.aplicaGarantia,
      tratamientoGarantia: p.tratamientoGarantia,
      terminoLegal: p.terminoLegal,
      fechaCierre: p.fechaCierre,
      inventarioId: p.inventarioId,
      ventaId: p.ventaId,
      cotizacionId: p.cotizacionId,
      trazabilidad: typeof p.trazabilidad === 'string' ? p.trazabilidad : JSON.stringify(p.trazabilidad || []),
      usuarioAsignadoId: p.usuarioAsignadoId || null,
      usuarioAsignado: p.usuarioAsignado?.user || '',
      usuarioAsignadoNombre: p.usuarioAsignado ? `${p.usuarioAsignado.nombre} ${p.usuarioAsignado.apellido || ''}`.trim() : ''
    }));

    // Mapear Servicios Técnicos
    const serviciosRaw = await prisma.servicio.findMany({
      include: { cliente: true, tecnico: true },
      orderBy: { id: 'asc' }
    });
    const servicios = serviciosRaw.map(s => ({
      id: s.id,
      clienteId: s.clienteId,
      docCli: s.cliente?.doc || '',
      cliente: s.cliente?.nom || '',
      fechaProg: s.fechaProg,
      tipo: s.tipo,
      obs: s.obs,
      estado: s.estado,
      obsAdmin: s.obsAdmin,
      lockedBy: s.lockedBy,
      tecnicoId: s.tecnicoId || null,
      tecnico: s.tecnico?.user || '',
      tecnicoNombre: s.tecnico ? `${s.tecnico.nombre} ${s.tecnico.apellido || ''}`.trim() : '',
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
      evidencias: typeof s.evidencias === 'string' ? s.evidencias : JSON.stringify(s.evidencias || []),
      trazabilidad: typeof s.trazabilidad === 'string' ? s.trazabilidad : JSON.stringify(s.trazabilidad || []),
      aplicaGarantia: s.aplicaGarantia,
      costoServicio: s.costoServicio
    }));

    const solicitudesRaw = await prisma.solicitud.findMany({
      include: { asesor: true },
      orderBy: { id: 'asc' }
    });
    const solicitudes = solicitudesRaw.map(s => ({
      id: s.id,
      fecha: s.fecha ? s.fecha.toISOString() : '',
      asesorId: s.asesorId,
      asesor: s.asesor?.user || '',
      nombreAsesor: s.nombreAsesor || (s.asesor ? `${s.asesor.nombre} ${s.asesor.apellido || ''}`.trim() : ''),
      tipo: s.tipo,
      detalle: s.detalle || '',
      evidencia: s.evidencia || null,
      fileUrl: s.fileUrl || null,
      estado: s.estado,
      lockedBy: s.lockedBy || null,
      comentario: s.comentario || '',
      fechaRadicado: s.fechaRadicado ? s.fechaRadicado.toISOString() : ''
    }));

    const procesosDisciplinariosRaw = await prisma.procesoDisciplinario.findMany({
      include: { asesor: true, jefe: true },
      orderBy: { id: 'asc' }
    });
    const procesosDisciplinarios = procesosDisciplinariosRaw.map(p => ({
      id: p.id,
      fecha: p.fecha ? p.fecha.toISOString() : '',
      asesorId: p.asesorId,
      asesor: p.asesor?.user || '',
      asesorNombre: p.asesor ? `${p.asesor.nombre} ${p.asesor.apellido || ''}`.trim() : '',
      jefeId: p.jefeId || null,
      jefe: p.jefe?.user || (p.jefeId ? '' : 'Admin'),
      jefeNombre: p.jefe ? `${p.jefe.nombre} ${p.jefe.apellido || ''}`.trim() : '',
      falta: p.falta || 'Falta',
      obs: p.obs || '',
      etapa: p.etapa || 1,
      descargo: p.descargo || '',
      sancion: p.sancion || '',
      diasSuspension: p.diasSuspension || 0,
      renunciaTerminos: p.renunciaTerminos || false,
      timestampEtapa: p.timestampEtapa ? p.timestampEtapa.toISOString() : (p.fecha ? p.fecha.toISOString() : ''),
      lockedBy: p.lockedBy || null,
      evidencias: p.evidencias || []
    }));

    const evaluacionesRaw = await prisma.evaluacion.findMany({
      include: { evaluador: true, evaluado: true },
      orderBy: { id: 'asc' }
    });
    const evaluaciones = evaluacionesRaw.map(ev => ({
      id: ev.id,
      fecha: ev.fecha ? ev.fecha.toISOString() : '',
      evaluadorId: ev.evaluadorId,
      evaluador: ev.evaluador?.user || '',
      evaluadorNombre: ev.evaluador ? `${ev.evaluador.nombre} ${ev.evaluador.apellido || ''}`.trim() : '',
      evaluadoId: ev.evaluadoId,
      evaluado: ev.evaluado?.user || ev.empleado || '',
      evaluadoNombre: ev.evaluadoNombre || (ev.evaluado ? `${ev.evaluado.nombre} ${ev.evaluado.apellido || ''}`.trim() : (ev.empleado || '')),
      empleado: ev.empleado || ev.evaluado?.user || '',
      tipo: ev.tipo || 'Evaluación',
      obs: ev.obs || '',
      lockedBy: ev.lockedBy || null,
      metajobs: ev.metajobs || 5,
      asistencia: ev.asistencia || 5,
      objetivos: ev.objetivos || 5,
      promedio: ev.promedio || 5.0,
      scores: ev.scores || null
    }));

    const anunciosRaw = await prisma.anuncio.findMany({ orderBy: { id: 'asc' } });
    const anuncios = anunciosRaw.map(a => ({
      id: a.id,
      fecha: a.fecha ? a.fecha.toISOString() : '',
      titulo: a.titulo,
      mensaje: a.mensaje || a.contenido || '',
      lockedBy: a.lockedBy || null,
      contenido: a.contenido || a.mensaje || '',
      expiresAt: a.expiresAt ? a.expiresAt.toISOString() : '',
      expired: a.expired || false
    }));

    // Mapear Cotizaciones
    const cotizacionesRaw = await prisma.cotizacion.findMany({
      include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
      orderBy: { id: 'asc' }
    });
    const cotizaciones = cotizacionesRaw.map(c => {
      const meta = (c.equipos && typeof c.equipos === 'object' && !Array.isArray(c.equipos) && c.equipos._meta) ? c.equipos._meta : {};
      const equiposList = (c.equipos && typeof c.equipos === 'object' && !Array.isArray(c.equipos) && Array.isArray(c.equipos.items)) ? c.equipos.items : (Array.isArray(c.equipos) ? c.equipos : []);

      return {
        id: c.id,
        numCotizacion: c.numCotizacion || meta.numCotizacion || '',
        fecha: c.fecha,
        fechaIso: c.fecha,
        vendedor: c.vendedor?.user || '',
        vendedorId: c.vendedorId,
        clienteId: c.clienteId,
        docCli: c.cliente?.doc || meta.clienteNit || '',
        cliente: c.cliente?.nom || meta.clienteNombre || '',
        clienteNombre: meta.clienteNombre || c.cliente?.nom || '',
        clienteDireccion: meta.clienteDireccion || c.cliente?.direccion || '',
        clienteCiudadDpto: meta.clienteCiudadDpto || (c.cliente?.ciudad ? (c.cliente.ciudad + (c.cliente.departamento ? ' / ' + c.cliente.departamento : '')) : ''),
        clientePais: meta.clientePais || 'Colombia',
        clienteTelefono: meta.clienteTelefono || c.cliente?.tel || '',
        clienteMovil: meta.clienteMovil || c.cliente?.celularContacto || c.cliente?.tel || '',
        clienteEmail: meta.clienteEmail || c.cliente?.correo || c.cliente?.correoFacturacion || '',
        clienteNit: meta.clienteNit || c.cliente?.doc || '',
        contacto: c.contacto || meta.contacto || c.cliente?.contactoComercial || '',
        
        items: c.items.map(i => ({
          productoId: i.productoId,
          producto: i.producto?.ref || i.producto?.cod || '',
          cant: i.cant,
          desc: i.desc,
          precioUnitario: i.precioUnitario
        })),
        // Legacy flat fields for retro-compatibility (first item)
        idProd: c.items[0]?.productoId || null,
        producto: c.items[0]?.producto?.ref || null,
        cant: c.items.reduce((acc, i) => acc + i.cant, 0),
        desc: meta.desc !== undefined ? meta.desc : c.items.reduce((acc, i) => acc + i.desc, 0),
        precioUnitario: c.items[0]?.precioUnitario || null,
        
        total: c.total,
        comisionistaId: c.comisionistaId,
        comisionistaNombre: c.comisionistaNombre,
        comisionistaPct: c.comisionistaPct,
        comisionistaValor: c.comisionistaValor,
        lockedBy: c.lockedBy,
        contacto: c.contacto || meta.contacto || '',
        condiciones: c.condiciones || meta.condiciones || '',
        tiempoEntrega: c.tiempoEntrega || meta.tiempoEntrega || '',
        direccionEntrega: c.direccionEntrega || meta.direccionEntrega || '',
        detallePagoMixto: c.detallePagoMixto || meta.detallePagoMixto || '',
        cuentas: c.cuentas,
        cuentasBancarias: c.cuentas || '[]',
        firmanteNombre: c.firmanteNombre,
        firmanteCargo: c.firmanteCargo,
        firmanteCorreo: c.firmanteCorreo,
        firmanteMovil: c.firmanteMovil,
        garantia: c.garantia || meta.garantia || '',
        observacion: c.observacion || meta.observacion || '',
        vendedorNombre: c.vendedorNombre || `${c.vendedor?.nombre || ''} ${c.vendedor?.apellido || ''}`.trim(),
        vendedorCargo: c.vendedorCargo || c.vendedor?.cargo || 'Asesor',
        vendedorEmail: c.vendedorEmail || c.vendedor?.correo || '',
        vendedorMovil: c.vendedorMovil || c.vendedor?.telefono || '',
        vendedorCodigoAsesor: c.vendedorCodigoAsesor || c.vendedor?.codigoAsesor || '',
        vigencia: c.vigencia,
        ivaTipo: c.ivaTipo || meta.ivaTipo || 'sin_iva',
        equipos: equiposList,
        materiales: c.materiales || [],
        tipo_precio: c.tipo_precio || meta.priceTier || 'precio_publico',
        priceTier: meta.priceTier || c.tipo_precio || 'precio_publico',
        fechaSeguimiento: c.fechaSeguimiento,
        estadoSeguimiento: c.estadoSeguimiento,
        motivoSeguimiento: c.motivoSeguimiento,
        motivoNoCompra: c.motivoNoCompra,
        seguimiento: {
          estado: c.estadoSeguimiento || 'pendiente',
          compraParcialDetalles: c.motivoSeguimiento || '',
          noCompraronMotivo: c.motivoNoCompra || '',
          noCompraronDetalle: '',
          fechaSeguimiento: c.fechaSeguimiento ? new Date(c.fechaSeguimiento).toLocaleDateString('es-CO') : null,
          vendedor: c.vendedor?.user || ''
        },
        ...meta
      };
    });

    const chatGroupsRaw = await prisma.chatGroup.findMany({ 
      include: { createdBy: true },
      orderBy: { fecha: 'asc' } 
    });
    const chatGroups = chatGroupsRaw.map(g => ({
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion || '',
      createdById: g.createdById,
      createdBy: g.createdBy?.user || g.createdById,
      creadorNombre: g.createdBy ? `${g.createdBy.nombre} ${g.createdBy.apellido || ''}`.trim() : '',
      fecha: g.fecha ? g.fecha.toISOString() : new Date().toISOString(),
      integrantes: typeof g.integrantes === 'string' ? JSON.parse(g.integrantes) : (g.integrantes || [])
    }));

    const chatDesc = await prisma.chat.findMany({ 
      include: { sender: true, receiver: true },
      orderBy: { timestamp: 'desc' }, 
      take: 200 
    });
    const chat = chatDesc.reverse().map(c => ({
      id: c.id,
      timestamp: c.timestamp ? new Date(c.timestamp).getTime() : Date.now(),
      fecha: c.fecha ? c.fecha.toISOString() : new Date().toISOString(),
      senderId: c.senderId,
      user: c.sender?.user || c.senderId,
      nombre: c.nombre || (c.sender ? `${c.sender.nombre} ${c.sender.apellido || ''}`.trim() : 'Usuario'),
      receiverId: c.receiverId,
      to: c.senderTabId ? c.senderTabId : (c.receiver?.user || c.receiverId || 'Todos'),
      text: c.text || '',
      senderTabId: c.senderTabId || null,
      isNudge: !!c.isNudge,
      isSticker: !!c.isSticker,
      stickerId: c.stickerId || null,
      stickerUrl: c.stickerUrl || null,
      isAudio: !!c.isAudio,
      audioUrl: c.audioUrl || null,
      isFile: !!c.isFile,
      fileUrl: c.fileUrl || null,
      fileName: c.fileName || null,
      fileType: c.fileType || null,
      isMeeting: !!c.isMeeting,
      meetingId: c.meetingId || null,
      readAt: c.readAt ? new Date(c.readAt).getTime() : null,
      isDeleted: !!c.isDeleted,
      isEdited: !!c.isEdited,
      reactions: c.reactions || {},
      replyTo: c.replyTo || null,
      replyToObj: c.replyToObj || null,
      hiddenBy: c.hiddenBy || [],
      fileSize: c.fileSize || null
    }));
    const auditoriaDesc = await prisma.auditoria.findMany({
      include: { user: true },
      orderBy: { id: 'desc' },
      take: 200
    });
    const auditoria = auditoriaDesc.reverse().map(a => ({
      id: a.id,
      userId: a.userId,
      user: a.user?.user || a.user?.nombre || a.userId,
      fecha: a.fecha ? a.fecha.toISOString() : new Date().toISOString(),
      action: a.action,
      modulo: a.modulo,
      recordDetails: a.recordDetails || '',
      shadowingData: a.shadowingData || null,
      hash: a.hash || null
    }));

    const notificacionesDesc = await prisma.notificacion.findMany({
      include: { para: true },
      orderBy: { id: 'desc' },
      take: 100
    });
    const notificaciones = notificacionesDesc.reverse().map(n => ({
      id: n.id,
      paraId: n.paraId,
      para: n.para?.user || n.paraId,
      titulo: n.titulo || null,
      mensaje: n.mensaje,
      de: n.de || null,
      tipo: n.tipo || null,
      fecha: n.fecha ? n.fecha.toISOString() : new Date().toISOString(),
      leida: !!n.leida,
      targetModule: n.targetModule || null
    }));
    const cuentasCobroRaw = await prisma.cuentasCobro.findMany({ orderBy: { fecha: 'asc' } });
    const cuentasCobro = cuentasCobroRaw.map(c => ({
      id: c.id,
      ciudad: c.ciudad || '',
      fecha: c.fecha ? c.fecha.toISOString() : '',
      cuenta: c.cuenta || '',
      num: c.cuenta || '',
      nombre: c.nombre || '',
      comisionista: c.nombre || '',
      cedula: c.cedula || '',
      correo: c.correo || '',
      concepto: c.concepto || '',
      items: typeof c.items === 'string' ? JSON.parse(c.items) : (c.items || []),
      nequi: c.nequi || '',
      titular: c.titular || '',
      estado: c.estado || '',
      total: c.total || 0,
      tecnicos: typeof c.tecnicos === 'string' ? JSON.parse(c.tecnicos) : (c.tecnicos || []),
      fechaRadicacion: c.fechaRadicacion ? c.fechaRadicacion.toISOString() : null,
      fechaAprobacion: c.fechaAprobacion ? c.fechaAprobacion.toISOString() : null,
      fechaPago: c.fechaPago ? c.fechaPago.toISOString() : null,
      aprobadoPor: c.aprobadoPor || '',
      notasSeguimiento: c.notasSeguimiento || ''
    }));

    const comisionistasRaw = await prisma.comisionista.findMany({
      include: { owner: true },
      orderBy: { id: 'asc' }
    });
    const comisionistas = comisionistasRaw.map(c => ({
      id: c.id,
      tipo: c.tipo || 'Técnico Participante',
      nombre: c.nombre,
      cedula: c.cedula || c.doc || '',
      doc: c.doc || c.cedula || '',
      telefono: c.telefono || c.tel || '',
      tel: c.tel || c.telefono || '',
      correo: c.correo || '',
      direccion: c.direccion || '',
      cliente_remite: c.cliente_remite || '',
      valor_venta: c.valor_venta || 0,
      pct_comision: c.pct_comision || c.porcentaje || 10,
      porcentaje: c.porcentaje || c.pct_comision || 10,
      fecha: c.fecha || '',
      ownerId: c.ownerId || null,
      owner: c.owner?.user || '',
      ownerNombre: c.owner ? `${c.owner.nombre} ${c.owner.apellido || ''}`.trim() : '',
      lockedBy: c.lockedBy || null,
      estado: c.estado || 'Activo',
      banco: c.banco || '',
      tipoCuenta: c.tipoCuenta || '',
      numeroCuenta: c.numeroCuenta || ''
    }));

    // WhatsApp Config (Línea oficial eliminada)
    const config = await prisma.whatsappConfig.findFirst();
    let parsedTemplates = null;
    if (config && config.templates) {
      try {
        parsedTemplates = typeof config.templates === 'string' ? JSON.parse(config.templates) : config.templates;
      } catch (e) { parsedTemplates = null; }
    }
    const whatsappConfig = config && config.phone ? { phone: config.phone, status: config.status, templates: parsedTemplates } : null;
    const informesConfig = await prisma.informesConfig.findUnique({ where: { id: 1 } });
    
    // Configuración general combinada
    const appConfig = {
      whatsapp: whatsappConfig,
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
      },
      nit: '806.008.716-5',
      direccion: 'DG 21 # 52 A - 23, BOSQUE, CARTAGENA',
      email: 'dircomercial@ibrosas.com',
      telefono: '',
      nombreEmpresa: 'IBRO'
    };

    const capacitacionesRaw = await prisma.capacitacion.findMany({
      include: { creador: true },
      orderBy: { fecha: 'desc' }
    });
    const capacitaciones = capacitacionesRaw.map(c => ({
      id: c.id,
      tipo: c.tipo || 'Capacitación',
      tema: c.tema,
      descripcion: c.descripcion || '',
      fecha: c.fecha ? c.fecha.toISOString() : '',
      hora: c.hora || '08:00 AM',
      obligatoria: c.obligatoria,
      creadorId: c.creadorId,
      creador: c.creador?.user || '',
      creadorNombre: c.creador ? `${c.creador.nombre} ${c.creador.apellido || ''}`.trim() : '',
      videoLink: c.videoLink || '',
      videoFile: c.videoFile || null,
      videoFileName: c.videoFileName || '',
      plataforma: c.plataforma || null,
      enlaceReunion: c.enlaceReunion || null,
      tutorFirma: c.tutorFirma || null,
      tutor: c.tutor || null,
      creadoEn: c.creadoEn ? c.creadoEn.toISOString() : (c.fecha ? c.fecha.toISOString() : ''),
      materiales: c.materiales || [],
      asistentes: c.asistentes || [],
      evaluacion: c.evaluacion || null,
      estado: c.estado || 'Programada',
      lockedBy: c.lockedBy || null
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
      informesConfig: appConfig.informes,
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
  const targetUser = req.body.user || req.user?.user;
  const targetId = req.body.id || req.user?.id;
  const { lat, lng } = req.body;
  if ((!targetUser && !targetId) || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Faltan datos de ubicación' });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
    return res.status(400).json({ error: 'Coordenadas numéricas inválidas o fuera de rango geográfico' });
  }

  try {
    const whereConditions = [];
    if (targetId) whereConditions.push({ id: String(targetId) });
    if (targetUser) whereConditions.push({ user: { equals: String(targetUser), mode: 'insensitive' } });

    const now = Date.now();
    await prisma.user.updateMany({
      where: { OR: whereConditions },
      data: {
        lat: parsedLat,
        lng: parsedLng,
        lastLocationUpdate: now
      }
    });

    if (io) {
      io.emit('LOCATION_UPDATE', {
        user: targetUser,
        id: targetId,
        lat: parsedLat,
        lng: parsedLng,
        lastLocationUpdate: now
      });
    }

    res.json({ success: true, lat: parsedLat, lng: parsedLng });
  } catch (error) {
    console.error('Error actualizando ubicación:', error);
    res.status(500).json({ error: 'Error del servidor', details: error.message });
  }
});

// GET /api/location/users: Obtener la ubicación de todos los usuarios
app.get('/api/location/users', optionalAuthenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        nombre: true,
        apellido: true,
        user: true,
        roleId: true,
        cargo: true,
        foto: true,
        telefono: true,
        isOnline: true,
        lat: true,
        lng: true,
        lastLocationUpdate: true
      },
      where: {
        lat: { not: null },
        lng: { not: null }
      }
    });
    const mappedUsers = users.map(u => ({
      ...u,
      username: u.user
    }));
    res.json(mappedUsers);
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
      result = raw.map(v => {
        const meta = (v.equipos && typeof v.equipos === 'object' && !Array.isArray(v.equipos) && v.equipos._meta) ? v.equipos._meta : {};
        const equiposList = (v.equipos && typeof v.equipos === 'object' && !Array.isArray(v.equipos) && Array.isArray(v.equipos.items)) ? v.equipos.items : (Array.isArray(v.equipos) ? v.equipos : []);

        return {
          id: v.id,
          fecha: v.fecha,
          fechaIso: v.fechaIso,
          venceGarantiaIso: v.venceGarantiaIso,
          mesesGarantia: v.mesesGarantia,
          vendedor: v.vendedor?.user || '',
          vendedorId: v.vendedorId,
          clienteId: v.clienteId,
          docCli: v.cliente?.doc || meta.clienteNit || '',
          cliente: v.cliente?.nom || meta.clienteNombre || '',
          clienteNombre: meta.clienteNombre || v.cliente?.nom || '',
          clienteNit: meta.clienteNit || v.cliente?.doc || '',
          clienteDireccion: meta.clienteDireccion || v.cliente?.direccion || '',
          clienteTelefono: meta.clienteTelefono || v.cliente?.tel || '',
          clienteEmail: meta.clienteEmail || v.cliente?.correo || '',
          items: v.items.map(i => ({
            productoId: i.productoId,
            producto: i.producto?.ref || '',
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
          numPedido: meta.numPedido || (v.id.startsWith('PED-') ? v.id : 'PED-' + v.id.slice(-4)),
          vendedorNombre: v.vendedorNombre || v.vendedor?.nombre || '',
          vendedorCargo: v.vendedorCargo || v.vendedor?.cargo || '',
          vendedorEmail: v.vendedorEmail || v.vendedor?.correo || '',
          vendedorMovil: v.vendedorMovil || v.vendedor?.telefono || '',
          vendedorCodigoAsesor: v.vendedorCodigoAsesor || v.vendedor?.codigoAsesor || '',
          equipos: equiposList,
          materiales: v.materiales || [],
          cuentasBancarias: v.cuentasBancarias,
          ...meta
        };
      });
    } else if (model === 'cotizaciones') {
      const raw = await prisma.cotizacion.findMany({
        skip, take,
        include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
        orderBy: { id: 'desc' }
      });
      raw.reverse();
      result = raw.map(c => {
        const meta = (c.equipos && typeof c.equipos === 'object' && !Array.isArray(c.equipos) && c.equipos._meta) ? c.equipos._meta : {};
        const equiposList = (c.equipos && typeof c.equipos === 'object' && !Array.isArray(c.equipos) && Array.isArray(c.equipos.items)) ? c.equipos.items : (Array.isArray(c.equipos) ? c.equipos : []);

        return {
          id: c.id,
          fecha: c.fecha,
          fechaIso: c.fecha,
          vendedor: c.vendedor?.user || '',
          vendedorId: c.vendedorId,
          clienteId: c.clienteId,
          docCli: c.cliente?.doc || meta.clienteNit || '',
          cliente: c.cliente?.nom || meta.clienteNombre || '',
          clienteNombre: meta.clienteNombre || c.cliente?.nom || '',
          clienteDireccion: meta.clienteDireccion || c.cliente?.direccion || '',
          clienteCiudadDpto: meta.clienteCiudadDpto || (c.cliente?.ciudad ? (c.cliente.ciudad + (c.cliente.departamento ? ' / ' + c.cliente.departamento : '')) : ''),
          clientePais: meta.clientePais || 'Colombia',
          clienteTelefono: meta.clienteTelefono || c.cliente?.tel || '',
          clienteMovil: meta.clienteMovil || c.cliente?.celularContacto || c.cliente?.tel || '',
          clienteEmail: meta.clienteEmail || c.cliente?.correo || c.cliente?.correoFacturacion || '',
          clienteNit: meta.clienteNit || c.cliente?.doc || '',
          contacto: c.contacto || meta.contacto || c.cliente?.contactoComercial || '',
          items: c.items.map(i => ({
            productoId: i.productoId,
            producto: i.producto?.ref || i.producto?.cod || '',
            cant: i.cant,
            desc: i.desc,
            precioUnitario: i.precioUnitario
          })),
          idProd: c.items[0]?.productoId || null,
          producto: c.items[0]?.producto?.ref || null,
          cant: c.items.reduce((acc, i) => acc + i.cant, 0),
          desc: meta.desc !== undefined ? meta.desc : c.items.reduce((acc, i) => acc + i.desc, 0),
          precioUnitario: c.items[0]?.precioUnitario || null,
          total: c.total,
          observacion: c.observacion || meta.observacion || '',
          estado: c.estadoSeguimiento || 'aprobado',
          lockedBy: c.lockedBy,
          numCotizacion: c.numCotizacion || meta.numCotizacion || '',
          condiciones: c.condiciones || meta.condiciones || '',
          tiempoEntrega: c.tiempoEntrega || meta.tiempoEntrega || '',
          direccionEntrega: c.direccionEntrega || meta.direccionEntrega || '',
          detallePagoMixto: c.detallePagoMixto || meta.detallePagoMixto || '',
          vigencia: c.vigencia,
          garantia: c.garantia || meta.garantia || '',
          ivaTipo: c.ivaTipo || meta.ivaTipo || 'sin_iva',
          priceTier: meta.priceTier || c.tipo_precio || 'precio_publico',
          vendedorNombre: c.vendedorNombre || `${c.vendedor?.nombre || ''} ${c.vendedor?.apellido || ''}`.trim(),
          vendedorCargo: c.vendedorCargo || c.vendedor?.cargo || 'Asesor',
          vendedorEmail: c.vendedorEmail || c.vendedor?.correo || '',
          vendedorMovil: c.vendedorMovil || c.vendedor?.telefono || '',
          vendedorCodigoAsesor: c.vendedorCodigoAsesor || c.vendedor?.codigoAsesor || '',
          equipos: equiposList,
          materiales: c.materiales || [],
          cuentasBancarias: c.cuentas || '[]',
          seguimiento: {
            estado: c.estadoSeguimiento || 'pendiente',
            compraParcialDetalles: c.motivoSeguimiento || '',
            noCompraronMotivo: c.motivoNoCompra || '',
            noCompraronDetalle: '',
            fechaSeguimiento: c.fechaSeguimiento ? new Date(c.fechaSeguimiento).toLocaleDateString('es-CO') : null,
            vendedor: c.vendedor?.user || ''
          },
          ...meta
        };
      });
    } else if (model === 'chat') {
      const chatRows = await prisma.chat.findMany({
        skip,
        take,
        include: { sender: true, receiver: true },
        orderBy: { timestamp: 'desc' }
      });
      result = chatRows.reverse().map(c => ({
        id: c.id,
        timestamp: c.timestamp ? new Date(c.timestamp).getTime() : Date.now(),
        fecha: c.fecha ? c.fecha.toISOString() : new Date().toISOString(),
        senderId: c.senderId,
        user: c.sender?.user || c.senderId,
        nombre: c.nombre || (c.sender ? `${c.sender.nombre} ${c.sender.apellido || ''}`.trim() : 'Usuario'),
        receiverId: c.receiverId,
        to: c.senderTabId ? c.senderTabId : (c.receiver?.user || c.receiverId || 'Todos'),
        text: c.text || '',
        senderTabId: c.senderTabId || null,
        isNudge: !!c.isNudge,
        isSticker: !!c.isSticker,
        stickerId: c.stickerId || null,
        stickerUrl: c.stickerUrl || null,
        isAudio: !!c.isAudio,
        audioUrl: c.audioUrl || null,
        isFile: !!c.isFile,
        fileUrl: c.fileUrl || null,
        fileName: c.fileName || null,
        fileType: c.fileType || null,
        isMeeting: !!c.isMeeting,
        meetingId: c.meetingId || null,
        readAt: c.readAt ? new Date(c.readAt).getTime() : null,
        isDeleted: !!c.isDeleted,
        isEdited: !!c.isEdited,
        reactions: c.reactions || {},
        replyTo: c.replyTo || null,
        replyToObj: c.replyToObj || null,
        hiddenBy: c.hiddenBy || [],
        fileSize: c.fileSize || null
      }));
    } else if (model === 'pqrs') {
      const pqrRows = await prisma.pQR.findMany({
        skip,
        take,
        include: { cliente: true, usuarioAsignado: true },
        orderBy: { id: 'desc' }
      });
      result = pqrRows.reverse().map(p => ({
        id: p.id,
        clienteId: p.clienteId,
        fecha: p.fecha,
        limiteIso: p.limiteIso,
        docCli: p.cliente?.doc || '',
        cliente: p.cliente?.nom || '',
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
        evidencias: typeof p.evidencias === 'string' ? p.evidencias : JSON.stringify(p.evidencias || []),
        aplicaGarantia: p.aplicaGarantia,
        tratamientoGarantia: p.tratamientoGarantia,
        terminoLegal: p.terminoLegal,
        fechaCierre: p.fechaCierre,
        inventarioId: p.inventarioId,
        ventaId: p.ventaId,
        cotizacionId: p.cotizacionId,
        trazabilidad: typeof p.trazabilidad === 'string' ? p.trazabilidad : JSON.stringify(p.trazabilidad || []),
        usuarioAsignadoId: p.usuarioAsignadoId || null,
        usuarioAsignado: p.usuarioAsignado?.user || '',
        usuarioAsignadoNombre: p.usuarioAsignado ? `${p.usuarioAsignado.nombre} ${p.usuarioAsignado.apellido || ''}`.trim() : ''
      }));
    } else if (model === 'facturas' || model === 'cuentasCobro') {
      const ccRows = await prisma.cuentasCobro.findMany({ skip, take, orderBy: { fecha: 'desc' } });
      result = ccRows.reverse().map(c => ({
        id: c.id,
        ciudad: c.ciudad || '',
        fecha: c.fecha ? c.fecha.toISOString() : '',
        cuenta: c.cuenta || '',
        num: c.cuenta || '',
        nombre: c.nombre || '',
        comisionista: c.nombre || '',
        cedula: c.cedula || '',
        correo: c.correo || '',
        concepto: c.concepto || '',
        items: typeof c.items === 'string' ? JSON.parse(c.items) : (c.items || []),
        nequi: c.nequi || '',
        titular: c.titular || '',
        estado: c.estado || '',
        total: c.total || 0,
        tecnicos: typeof c.tecnicos === 'string' ? JSON.parse(c.tecnicos) : (c.tecnicos || [])
      }));
    } else if (model === 'servicios') {
      const servRows = await prisma.servicio.findMany({
        skip, take,
        include: { cliente: true, tecnico: true },
        orderBy: { id: 'desc' }
      });
      result = servRows.reverse().map(s => ({
        id: s.id,
        clienteId: s.clienteId,
        docCli: s.cliente?.doc || '',
        cliente: s.cliente?.nom || '',
        fechaProg: s.fechaProg,
        tipo: s.tipo,
        obs: s.obs,
        estado: s.estado,
        obsAdmin: s.obsAdmin,
        lockedBy: s.lockedBy,
        tecnicoId: s.tecnicoId || null,
        tecnico: s.tecnico?.user || '',
        tecnicoNombre: s.tecnico ? `${s.tecnico.nombre} ${s.tecnico.apellido || ''}`.trim() : '',
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
        evidencias: typeof s.evidencias === 'string' ? s.evidencias : JSON.stringify(s.evidencias || []),
        trazabilidad: typeof s.trazabilidad === 'string' ? s.trazabilidad : JSON.stringify(s.trazabilidad || []),
        aplicaGarantia: s.aplicaGarantia,
        costoServicio: s.costoServicio
      }));
    } else if (model === 'clientes') {
      const cliRows = await prisma.cliente.findMany({ skip, take, orderBy: { id: 'desc' } });
      const usersCache = await prisma.user.findMany();
      result = cliRows.reverse().map(c => {
        let dVal = '', mVal = '', aVal = '';
        if (c.fechaVinculacion) {
          const isoDate = c.fechaVinculacion instanceof Date ? c.fechaVinculacion.toISOString().split('T')[0] : String(c.fechaVinculacion).split('T')[0];
          if (isoDate.includes('-')) {
            const parts = isoDate.split('-');
            aVal = parts[0]; mVal = parts[1]; dVal = parts[2];
          }
        }
        const advisorUser = usersCache.find(u => 
          (c.asesorNombre && `${u.nombre || ''} ${u.apellido || ''}`.trim().toLowerCase() === c.asesorNombre.trim().toLowerCase()) ||
          (c.owner && u.user?.toLowerCase() === c.owner.toLowerCase())
        );
        return {
          ...c,
          dia: dVal,
          mes: mVal,
          anio: aVal,
          fechaVinculacion: dVal && mVal && aVal ? `${dVal}/${mVal}/${aVal}` : (c.fechaVinculacion || ''),
          asesorCedula: c.asesorCedula || advisorUser?.cedula || advisorUser?.id || '',
          asesorCodigo: c.asesorCodigo || advisorUser?.codigoAsesor || '',
          asesorNombre: c.asesorNombre || (advisorUser ? `${advisorUser.nombre || ''} ${advisorUser.apellido || ''}`.trim() : ''),
          asesorCargo: c.asesorCargo || advisorUser?.cargo || advisorUser?.rol || 'Administrador Master',
          asesorEmail: c.asesorEmail || advisorUser?.correo || advisorUser?.email || ''
        };
      });
    } else if (model === 'inventario') {
      const invRows = await prisma.inventario.findMany({ skip, take, orderBy: { id: 'desc' } });
      result = invRows.reverse().map(inv => ({
        ...inv,
        ...(inv.datosExt && typeof inv.datosExt === 'object' ? inv.datosExt : {})
      }));
    } else if (model === 'solicitudes') {
      const solRows = await prisma.solicitud.findMany({
        skip, take,
        include: { asesor: true },
        orderBy: { id: 'desc' }
      });
      result = solRows.reverse().map(s => ({
        id: s.id,
        fecha: s.fecha ? s.fecha.toISOString() : '',
        asesorId: s.asesorId,
        asesor: s.asesor?.user || '',
        nombreAsesor: s.nombreAsesor || (s.asesor ? `${s.asesor.nombre} ${s.asesor.apellido || ''}`.trim() : ''),
        tipo: s.tipo,
        detalle: s.detalle || '',
        evidencia: s.evidencia || null,
        fileUrl: s.fileUrl || null,
        estado: s.estado,
        lockedBy: s.lockedBy || null,
        comentario: s.comentario || '',
        fechaRadicado: s.fechaRadicado ? s.fechaRadicado.toISOString() : ''
      }));
    } else if (model === 'capacitaciones') {
      const capRows = await prisma.capacitacion.findMany({
        skip, take,
        include: { creador: true },
        orderBy: { fecha: 'desc' }
      });
      result = capRows.reverse().map(c => ({
        id: c.id,
        tipo: c.tipo || 'Capacitación',
        tema: c.tema,
        descripcion: c.descripcion || '',
        fecha: c.fecha ? c.fecha.toISOString() : '',
        hora: c.hora || '08:00 AM',
        obligatoria: c.obligatoria,
        creadorId: c.creadorId,
        creador: c.creador?.user || '',
        creadorNombre: c.creador ? `${c.creador.nombre} ${c.creador.apellido || ''}`.trim() : '',
        videoLink: c.videoLink || '',
        videoFile: c.videoFile || null,
        videoFileName: c.videoFileName || '',
        plataforma: c.plataforma || null,
        enlaceReunion: c.enlaceReunion || null,
        tutorFirma: c.tutorFirma || null,
        tutor: c.tutor || null,
        creadoEn: c.creadoEn ? c.creadoEn.toISOString() : (c.fecha ? c.fecha.toISOString() : ''),
        materiales: c.materiales || [],
        asistentes: c.asistentes || [],
        evaluacion: c.evaluacion || null,
        estado: c.estado || 'Programada',
        lockedBy: c.lockedBy || null
      }));
    } else if (model === 'chatGroups') {
      const groupsRaw = await prisma.chatGroup.findMany({
        skip,
        take,
        include: { createdBy: true },
        orderBy: { fecha: 'desc' }
      });
      result = groupsRaw.reverse().map(g => ({
        id: g.id,
        nombre: g.nombre,
        descripcion: g.descripcion || '',
        createdById: g.createdById,
        createdBy: g.createdBy?.user || g.createdById,
        creadorNombre: g.createdBy ? `${g.createdBy.nombre} ${g.createdBy.apellido || ''}`.trim() : '',
        fecha: g.fecha ? g.fecha.toISOString() : new Date().toISOString(),
        integrantes: typeof g.integrantes === 'string' ? JSON.parse(g.integrantes) : (g.integrantes || [])
      }));
    } else {
      return res.status(400).json({ error: 'Model not supported for pagination' });
    }
    res.json({ [model]: result });
  } catch (err) {
    console.error('Error in /api/paginated:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// 📱 MÓDULO WHATSAPP COMERCIAL & OMNICANAL
// ==========================================

const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: 'tpl-saludo',
    titulo: 'Saludo Inicial & Prospección',
    categoria: 'Comercial',
    badge: 'Ventas',
    icon: 'fa-hand',
    texto: 'Hola {{cliente}}, un gusto saludarte. Nos comunicamos de parte de nuestro equipo comercial para dar seguimiento a tu solicitud y brindarte la mejor asesoría técnica. ¿Tienes un momento para conversar?'
  },
  {
    id: 'tpl-cotizacion',
    titulo: 'Envío de Propuesta Comercial',
    categoria: 'Ventas',
    badge: 'Cotización',
    icon: 'fa-file-invoice-dollar',
    texto: 'Estimado(a) {{cliente}}, adjuntamos la propuesta comercial formal con las mejores condiciones y disponibilidad inmediata. Quedamos muy atentos a tus comentarios para proceder con la reserva.'
  },
  {
    id: 'tpl-garantia',
    titulo: 'Soporte Postventa & Garantía',
    categoria: 'Soporte',
    badge: 'Garantía',
    icon: 'fa-shield-halved',
    texto: 'Hola {{cliente}}, te informamos que tu solicitud de garantía y revisión técnica ha sido procesada exitosamente por nuestro departamento de calidad. Estamos atentos a tus indicaciones.'
  },
  {
    id: 'tpl-cobro',
    titulo: 'Recordatorio Amable de Cartera',
    categoria: 'Cartera',
    badge: 'Cobro',
    icon: 'fa-receipt',
    texto: 'Estimado(a) {{cliente}}, le recordamos cordialmente que su estado de cuenta presenta un saldo pendiente para conciliar. Agradecemos su confirmación de pago o soporte para actualizar su ficha en el sistema.'
  },
  {
    id: 'tpl-despacho',
    titulo: 'Confirmación de Despacho Logístico',
    categoria: 'Logística',
    badge: 'Entrega',
    icon: 'fa-truck-fast',
    texto: '¡Buenas noticias {{cliente}}! Tu pedido se encuentra programado para despacho. Si necesitas instrucciones especiales para la entrega, por favor respóndenos por este medio.'
  }
];

// GET /api/whatsapp/templates - Obtener plantillas
app.get('/api/whatsapp/templates', authenticateToken, async (req, res) => {
  try {
    const config = await prisma.whatsappConfig.findFirst();
    let templates = DEFAULT_WHATSAPP_TEMPLATES;
    if (config && config.templates) {
      try {
        const parsed = typeof config.templates === 'string' ? JSON.parse(config.templates) : config.templates;
        if (Array.isArray(parsed) && parsed.length > 0) {
          templates = parsed;
        }
      } catch (e) {}
    }
    res.json({ success: true, templates });
  } catch (err) {
    console.error('Error fetching WhatsApp templates:', err);
    res.status(500).json({ error: 'Error al consultar plantillas' });
  }
});

// POST /api/whatsapp/templates - Crear o actualizar plantilla
app.post('/api/whatsapp/templates', authenticateToken, async (req, res) => {
  try {
    const { template } = req.body;
    if (!template || !template.titulo || !template.texto) {
      return res.status(400).json({ error: 'Título y texto son obligatorios' });
    }

    const config = await prisma.whatsappConfig.findFirst();
    let currentTemplates = [...DEFAULT_WHATSAPP_TEMPLATES];
    if (config && config.templates) {
      try {
        const parsed = typeof config.templates === 'string' ? JSON.parse(config.templates) : config.templates;
        if (Array.isArray(parsed)) currentTemplates = parsed;
      } catch (e) {}
    }

    const tplId = template.id || `tpl-${Date.now()}`;
    const newTpl = {
      id: tplId,
      titulo: String(template.titulo).trim(),
      categoria: String(template.categoria || 'General').trim(),
      badge: String(template.badge || template.categoria || 'Plantilla').trim(),
      icon: String(template.icon || 'fa-message').trim(),
      texto: String(template.texto).trim(),
      creadoPor: req.user?.user || 'Sistema',
      actualizadoEn: new Date().toISOString()
    };

    const existingIdx = currentTemplates.findIndex(t => t.id === tplId);
    if (existingIdx >= 0) {
      currentTemplates[existingIdx] = newTpl;
    } else {
      currentTemplates.push(newTpl);
    }

    await prisma.whatsappConfig.upsert({
      where: { id: 1 },
      update: { templates: JSON.stringify(currentTemplates) },
      create: { id: 1, phone: '573000000000', status: 'Activo', templates: JSON.stringify(currentTemplates) }
    });

    res.json({ success: true, template: newTpl, templates: currentTemplates });
  } catch (err) {
    console.error('Error saving WhatsApp template:', err);
    res.status(500).json({ error: 'Error al guardar plantilla' });
  }
});

// DELETE /api/whatsapp/templates/:id - Eliminar plantilla
app.delete('/api/whatsapp/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const config = await prisma.whatsappConfig.findFirst();
    let currentTemplates = [...DEFAULT_WHATSAPP_TEMPLATES];
    if (config && config.templates) {
      try {
        const parsed = typeof config.templates === 'string' ? JSON.parse(config.templates) : config.templates;
        if (Array.isArray(parsed)) currentTemplates = parsed;
      } catch (e) {}
    }

    currentTemplates = currentTemplates.filter(t => t.id !== id);

    await prisma.whatsappConfig.upsert({
      where: { id: 1 },
      update: { templates: JSON.stringify(currentTemplates) },
      create: { id: 1, phone: '573000000000', status: 'Activo', templates: JSON.stringify(currentTemplates) }
    });

    res.json({ success: true, templates: currentTemplates });
  } catch (err) {
    console.error('Error deleting WhatsApp template:', err);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
});

// POST /api/whatsapp/log - Registrar despacho de mensaje en bitácora
app.post('/api/whatsapp/log', authenticateToken, async (req, res) => {
  try {
    const { telefono, contactoNombre, tipoContacto, mensaje, plantillaUsada } = req.body;
    if (!telefono) {
      return res.status(400).json({ error: 'El teléfono es requerido' });
    }

    let validUserId = req.user?.id;
    if (!validUserId) {
      const firstUser = await prisma.user.findFirst({ select: { id: true } });
      validUserId = firstUser?.id;
    }

    const logEntry = {
      id: `aud_wp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: validUserId,
      fecha: new Date(),
      action: 'WHATSAPP_ENVIADO',
      modulo: 'whatsapp_comercial',
      recordDetails: JSON.stringify({
        telefono: String(telefono).trim(),
        destinatario: contactoNombre || 'Contacto directo',
        tipoContacto: tipoContacto || 'Cliente',
        plantilla: plantillaUsada || 'Manual',
        mensaje: String(mensaje || '').trim(),
        estado: 'Despachado a WhatsApp Web'
      }),
      shadowingData: {
        telefono: String(telefono).trim(),
        destinatario: contactoNombre || 'Contacto directo',
        asesor: req.user?.user || 'Comercial',
        fechaEnvio: new Date().toISOString()
      },
      hash: Buffer.from(`${Date.now()}_WHATSAPP_${telefono}`).toString('base64')
    };

    const createdAudit = await prisma.auditoria.create({
      data: logEntry
    });

    res.json({ success: true, log: createdAudit });
  } catch (err) {
    console.error('Error logging WhatsApp message:', err);
    res.status(500).json({ error: 'Error al registrar bitácora de WhatsApp' });
  }
});

// GET /api/whatsapp/logs - Consultar historial de mensajes
app.get('/api/whatsapp/logs', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditoria.findMany({
      where: { modulo: 'whatsapp_comercial' },
      orderBy: { fecha: 'desc' },
      take: 50,
      include: { user: { select: { id: true, user: true, nombre: true, apellido: true } } }
    });
    res.json({ success: true, logs });
  } catch (err) {
    console.error('Error fetching WhatsApp logs:', err);
    res.status(500).json({ error: 'Error al consultar bitácora de WhatsApp' });
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
      // Caché local a la transacción para resolver usuarios y clientes sin peticiones duplicadas
      let cachedUsers = null;
      const getUsersCache = async () => {
        if (!cachedUsers) {
          cachedUsers = await tx.user.findMany({ select: { id: true, user: true, nombre: true, apellido: true } });
        }
        return cachedUsers;
      };

      // Resuelve un ID de usuario a partir de ID, username o nombre, con fallback seguro
      const resolveUser = async (userRef, allowFallback = true) => {
        const all = await getUsersCache();
        if (!userRef) {
          return allowFallback ? (req.user?.id || all[0]?.id || '1') : null;
        }
        const str = String(userRef).trim();
        // 1. Coincidencia directa por id
        const byId = all.find(u => String(u.id) === str);
        if (byId) return byId.id;
        // 2. Coincidencia por username (case-insensitive)
        const byUser = all.find(u => u.user && u.user.toLowerCase() === str.toLowerCase());
        if (byUser) return byUser.id;
        // 3. Coincidencia por nombre completo
        const byNom = all.find(u => (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === str.toLowerCase());
        if (byNom) return byNom.id;
        // 4. Fallback al usuario de sesión o primer usuario (solo si allowFallback es true)
        return allowFallback ? (req.user?.id || all[0]?.id || '1') : null;
      };

      // Resuelve un ID de cliente a partir de id, doc o nombre, sin generar registros basura
      const resolveClient = async (docCli, clienteId, fallbackName = 'Cliente') => {
        if (clienteId) {
          const byId = await tx.cliente.findUnique({ where: { id: String(clienteId) } });
          if (byId) return byId;
        }
        if (docCli && String(docCli).trim() && !String(docCli).startsWith('DOC-')) {
          const cleanDoc = String(docCli).trim();
          const byDoc = await tx.cliente.findUnique({ where: { doc: cleanDoc } });
          if (byDoc) return byDoc;
        }
        if (fallbackName && typeof fallbackName === 'string' && fallbackName.trim() && !fallbackName.startsWith('Cliente DOC-')) {
          const cleanName = fallbackName.trim();
          const byNom = await tx.cliente.findFirst({
            where: { nom: { equals: cleanName, mode: 'insensitive' } }
          });
          if (byNom) return byNom;
        }

        // Si se proporcionó un documento real válido y no existe, crearlo
        if (docCli && String(docCli).trim() && !String(docCli).startsWith('DOC-')) {
          const newDoc = String(docCli).trim();
          const newId = clienteId || (Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6));
          try {
            const created = await tx.cliente.create({
              data: {
                id: newId,
                doc: newDoc,
                nom: fallbackName || `Cliente ${newDoc}`,
                doc_tipo: 'CC',
                tipo_cliente: 'DOM',
                tel: 'N/A',
                correo: 'sin-correo@ibrosas.com'
              }
            });
            return created;
          } catch (e) {
            const existing = await tx.cliente.findFirst({ where: { OR: [{ id: newId }, { doc: newDoc }] } });
            if (existing) return existing;
          }
        }

        // Fallback seguro: reutilizar cliente real existente para no romper FK ni generar basura
        const anyLegitClient = await tx.cliente.findFirst({
          where: { NOT: { doc: { startsWith: 'DOC-' } } },
          orderBy: { id: 'asc' }
        });
        if (anyLegitClient) return anyLegitClient;

        const anyClient = await tx.cliente.findFirst({ orderBy: { id: 'asc' } });
        return anyClient;
      };

      // Resuelve un producto de inventario a partir de id, ref, cod o nombre
      const resolveProduct = async (idProd, refProd) => {
        if (idProd) {
          const byId = await tx.inventario.findUnique({ where: { id: String(idProd) } });
          if (byId) return byId;
        }
        if (refProd && String(refProd).trim()) {
          const searchStr = String(refProd).trim();
          const byRef = await tx.inventario.findFirst({
            where: {
              OR: [
                { ref: { equals: searchStr, mode: 'insensitive' } },
                { cod: { equals: searchStr, mode: 'insensitive' } },
                { nom: { equals: searchStr, mode: 'insensitive' } }
              ]
            }
          });
          if (byRef) return byRef;
        }
        const anyProd = await tx.inventario.findFirst({ orderBy: { id: 'asc' } });
        return anyProd;
      };

      // Helper para upserts en tablas directas aplicando sanitización estricta para Prisma
      const flatUpsert = async (table, items) => {
        for (const rawItem of items) {
          const cleaned = sanitizeBackendForPrisma(table, rawItem);
          if (!cleaned.id) {
            cleaned.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 7);
          }

          // Optimistic Concurrency Control (OCC)
          if (cleaned.lockedBy && cleaned.lockedBy !== user) {
            try {
              const existingRecord = await tx[table].findUnique({ where: { id: cleaned.id } });
              if (existingRecord && existingRecord.lockedBy && existingRecord.lockedBy !== user) {
                console.warn(`[OCC BLOCK] Usuario '${user}' no pudo sobrescribir '${table}' ID '${cleaned.id}' bloqueado por '${existingRecord.lockedBy}'.`);
                continue;
              }
            } catch (e) {}
          }

          const { id: idToUpsert, ...updateData } = cleaned;
          await tx[table].upsert({
            where: { id: cleaned.id },
            update: updateData,
            create: { id: idToUpsert || cleaned.id, ...updateData },
          });
        }
      };

      // Helper para eliminaciones
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
        await flatDelete('cliente', diff.clientes.deleted || []);
        for (const rawItem of diff.clientes.upserted || []) {
          const cleaned = sanitizeBackendForPrisma('cliente', rawItem);
          if (!cleaned.id) cleaned.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 7);

          if (cleaned.doc) {
            const existing = await tx.cliente.findUnique({ where: { doc: cleaned.doc } });
            if (existing && existing.id !== cleaned.id) {
              const { id: _ignoredId, ...updateData } = cleaned;
              await tx.cliente.update({
                where: { id: existing.id },
                data: updateData
              });
              continue;
            }
          }

          const { id: idToUpsert, ...dataToUpsert } = cleaned;
          await tx.cliente.upsert({
            where: { id: idToUpsert },
            update: dataToUpsert,
            create: cleaned,
          });
        }
      }

      // 3. Inventario (Productos)
      if (diff.inventario) {
        if (diff.inventario.deleted && diff.inventario.deleted.length > 0) {
          const invIds = diff.inventario.deleted.map(id => id.toString());
          await tx.servicio.updateMany({
            where: { inventarioId: { in: invIds } },
            data: { inventarioId: null }
          });
          await tx.pQR.updateMany({
            where: { inventarioId: { in: invIds } },
            data: { inventarioId: null }
          });
          await flatDelete('inventario', invIds);
        }
        for (const rawItem of diff.inventario.upserted || []) {
          const cleaned = sanitizeBackendForPrisma('inventario', rawItem);
          if (!cleaned.id) cleaned.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 7);

          if (cleaned.cod) {
            const existing = await tx.inventario.findUnique({ where: { cod: cleaned.cod } });
            if (existing && existing.id !== cleaned.id) {
              const { id: _ignoredId, ...updateData } = cleaned;
              await tx.inventario.update({
                where: { id: existing.id },
                data: updateData
              });
              continue;
            }
          }

          const { id: idToUpsert, ...dataToUpsert } = cleaned;
          await tx.inventario.upsert({
            where: { id: idToUpsert },
            update: dataToUpsert,
            create: cleaned,
          });
        }
      }

      // 4. Usuarios
      if (diff.users) {
        await flatDelete('user', diff.users.deleted || []);
        const isBcryptHash = (str) => /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
        
        for (const rawItem of diff.users.upserted || []) {
          const cleaned = sanitizeBackendForPrisma('user', rawItem);
          if (!cleaned.id) cleaned.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 7);

          if (cleaned.pass && !isBcryptHash(cleaned.pass)) {
            cleaned.pass = bcrypt.hashSync(cleaned.pass, 10);
          }

          const updateData = { ...cleaned };
          delete updateData.id;
          if (!updateData.pass) {
            delete updateData.pass;
          }
          if (!updateData.firma) {
            delete updateData.firma;
          }

          if (cleaned.user) {
            const existing = await tx.user.findUnique({ where: { user: cleaned.user } });
            if (existing && existing.id !== cleaned.id) {
              await tx.user.update({
                where: { id: existing.id },
                data: updateData
              });
              continue;
            }
          }

          const createData = cleaned.pass ? cleaned : { ...cleaned, pass: bcrypt.hashSync('Ibro2026*', 10) };

          await tx.user.upsert({
            where: { id: cleaned.id },
            update: updateData,
            create: createData,
          });
        }
      }

      // --- FASE 2: Tablas Relacionales (Ventas, Cotizaciones, PQRS, Servicios) ---

      // 5. Ventas / Facturación
      if (diff.ventas) {
        if (diff.ventas.deleted && diff.ventas.deleted.length > 0) {
          const ventaIds = diff.ventas.deleted.map(id => id.toString());
          await tx.pQR.updateMany({
            where: { ventaId: { in: ventaIds } },
            data: { ventaId: null }
          });
          await tx.servicio.updateMany({
            where: { ventaId: { in: ventaIds } },
            data: { ventaId: null }
          });
          await flatDelete('venta', ventaIds);
        }

        for (const item of diff.ventas.upserted || []) {
          const client = await resolveClient(item.docCli, item.clienteId, item.cliente || item.clienteNombre);
          const sellerId = await resolveUser(item.vendedorId || item.vendedor);

          const metaFields = {
            numPedido: item.numPedido,
            clienteNombre: item.clienteNombre || item.cliente || (client ? client.nom : undefined),
            clienteDireccion: item.clienteDireccion || (client ? client.direccion : undefined),
            clienteCiudadDpto: item.clienteCiudadDpto || (client ? client.ciudad : undefined),
            clientePais: item.clientePais,
            clienteTelefono: item.clienteTelefono || (client ? client.tel : undefined),
            clienteMovil: item.clienteMovil,
            clienteEmail: item.clienteEmail || (client ? client.correo : undefined),
            clienteNit: item.clienteNit || item.docCli || (client ? client.doc : undefined),
            contacto: item.contacto,
            condiciones: item.condiciones || item.metodoPago,
            metodoPago: item.metodoPago || item.condiciones,
            detallePagoMixto: item.detallePagoMixto,
            tiempoEntrega: item.tiempoEntrega,
            direccionEntrega: item.direccionEntrega,
            fechaEntrega: item.fechaEntrega,
            horaEntrega: item.horaEntrega,
            vigencia: item.vigencia,
            garantia: item.garantia,
            tipoGarantia: item.tipoGarantia,
            tiempoGarantia: item.tiempoGarantia,
            tiempoGarantiaDefecto: item.tiempoGarantiaDefecto,
            observacion: item.observacion,
            ivaTipo: item.ivaTipo,
            priceTier: item.priceTier,
            estadoAprobacion: item.estadoAprobacion,
            cuentasBancarias: item.cuentasBancarias
          };
          Object.keys(metaFields).forEach(k => metaFields[k] === undefined && delete metaFields[k]);
          
          let rawEquipos = [];
          if (Array.isArray(item.equipos)) {
            rawEquipos = item.equipos;
          } else if (item.equipos && typeof item.equipos === 'object' && Array.isArray(item.equipos.items)) {
            rawEquipos = item.equipos.items;
          }
          const finalEquipos = { items: rawEquipos, _meta: metaFields };

          const vData = sanitizeBackendForPrisma('venta', {
            ...item,
            metodoPago: item.metodoPago || item.condiciones || 'Contado',
            clienteId: client.id,
            vendedorId: sellerId,
            equipos: finalEquipos
          });

          const { id: _ignoredId, ...updateData } = vData;

          await tx.venta.upsert({
            where: { id: item.id },
            update: updateData,
            create: { id: item.id, ...updateData },
          });

          // Sincronizar Items de Venta
          await tx.ventaItem.deleteMany({ where: { ventaId: item.id } });
          let itemsRaw = (item.items && item.items.length > 0) ? item.items : null;
          if (!itemsRaw && rawEquipos.length > 0) {
            itemsRaw = rawEquipos.map(eq => ({
              productoId: eq.idProd || eq.productoId,
              producto: eq.codigo || eq.producto || eq.ref || eq.nom,
              cant: parseInt(eq.cantidad || eq.cant) || 1,
              precioUnitario: parseFloat(eq.valorUnitario || eq.precioUnitario) || 0,
              desc: parseFloat(eq.descuento || eq.desc) || 0,
              serialEquipo: eq.serialEquipo || null
            }));
          }
          if (!itemsRaw || itemsRaw.length === 0) {
            itemsRaw = [{
              productoId: item.productoId || item.idProd,
              producto: item.producto,
              cant: parseInt(item.cant) || 1,
              precioUnitario: parseFloat(item.precioUnitario) || parseFloat(item.total) || 0,
              desc: parseFloat(item.desc) || 0,
              serialEquipo: item.serialEquipo || null
            }];
          }

          for (const i of itemsRaw) {
            const prod = await resolveProduct(i.productoId || i.idProd, i.producto);
            if (prod) {
              await tx.ventaItem.create({
                data: {
                  ventaId: item.id,
                  productoId: prod.id,
                  cant: parseInt(i.cant) || 1,
                  precioUnitario: parseFloat(i.precioUnitario) || 0,
                  desc: parseFloat(i.desc) || 0,
                  serialEquipo: i.serialEquipo || null
                }
              });
            }
          }
        }
      }

      // 6. Cotizaciones
      if (diff.cotizaciones) {
        if (diff.cotizaciones.deleted && diff.cotizaciones.deleted.length > 0) {
          const cotIds = diff.cotizaciones.deleted.map(id => id.toString());
          await tx.pQR.updateMany({
            where: { cotizacionId: { in: cotIds } },
            data: { cotizacionId: null }
          });
          await tx.servicio.updateMany({
            where: { cotizacionId: { in: cotIds } },
            data: { cotizacionId: null }
          });
          await flatDelete('cotizacion', cotIds);
        }

        for (const item of diff.cotizaciones.upserted || []) {
          const client = await resolveClient(item.docCli, item.clienteId, item.cliente || item.clienteNombre);
          const sellerId = await resolveUser(item.vendedorId || item.vendedor);

          const metaFields = {
            numCotizacion: item.numCotizacion,
            clienteNombre: item.clienteNombre || item.cliente || (client ? client.nom : undefined),
            clienteDireccion: item.clienteDireccion || (client ? client.direccion : undefined),
            clienteCiudadDpto: item.clienteCiudadDpto || (client ? client.ciudad : undefined),
            clientePais: item.clientePais,
            clienteTelefono: item.clienteTelefono || (client ? client.tel : undefined),
            clienteMovil: item.clienteMovil,
            clienteEmail: item.clienteEmail || (client ? client.correo : undefined),
            clienteNit: item.clienteNit || item.docCli || (client ? client.doc : undefined),
            contacto: item.contacto,
            condiciones: item.condiciones,
            detallePagoMixto: item.detallePagoMixto,
            tiempoEntrega: item.tiempoEntrega,
            direccionEntrega: item.direccionEntrega,
            fechaEntrega: item.fechaEntrega,
            horaEntrega: item.horaEntrega,
            vigencia: item.vigencia,
            garantia: item.garantia,
            tipoGarantia: item.tipoGarantia,
            tiempoGarantia: item.tiempoGarantia,
            tiempoGarantiaDefecto: item.tiempoGarantiaDefecto,
            observacion: item.observacion,
            ivaTipo: item.ivaTipo,
            priceTier: item.priceTier,
            estadoAprobacion: item.estadoAprobacion,
            cuentasBancarias: item.cuentasBancarias,
            desc: item.desc !== undefined ? item.desc : undefined
          };
          Object.keys(metaFields).forEach(k => metaFields[k] === undefined && delete metaFields[k]);

          let rawEquipos = [];
          if (Array.isArray(item.equipos)) {
            rawEquipos = item.equipos;
          } else if (item.equipos && typeof item.equipos === 'object' && Array.isArray(item.equipos.items)) {
            rawEquipos = item.equipos.items;
          }
          const finalEquipos = { items: rawEquipos, _meta: metaFields };

          const cData = sanitizeBackendForPrisma('cotizacion', {
            ...item,
            clienteId: client.id,
            vendedorId: sellerId,
            equipos: finalEquipos,
            cuentas: typeof item.cuentasBancarias === 'string' ? item.cuentasBancarias : (item.cuentasBancarias ? JSON.stringify(item.cuentasBancarias) : item.cuentas),
            estadoSeguimiento: item.seguimiento?.estado || item.estadoSeguimiento,
            motivoSeguimiento: item.seguimiento?.compraParcialDetalles || item.motivoSeguimiento,
            motivoNoCompra: item.seguimiento?.noCompraronMotivo ? (item.seguimiento.noCompraronMotivo + (item.seguimiento.noCompraronDetalle ? ': ' + item.seguimiento.noCompraronDetalle : '')) : item.motivoNoCompra,
            fechaSeguimiento: item.seguimiento?.fechaSeguimiento ? safeDate(item.seguimiento.fechaSeguimiento) : (item.fechaSeguimiento ? safeDate(item.fechaSeguimiento) : null)
          });

          const { id: _ignoredId, ...updateData } = cData;
          await tx.cotizacion.upsert({
            where: { id: item.id },
            update: updateData,
            create: { id: item.id, ...updateData },
          });

          // Sincronizar Items de Cotización
          await tx.cotizacionItem.deleteMany({ where: { cotizacionId: item.id } });
          let itemsRaw = (item.items && item.items.length > 0) ? item.items : null;
          if (!itemsRaw && rawEquipos.length > 0) {
            itemsRaw = rawEquipos.map(eq => ({
              productoId: eq.idProd || eq.productoId,
              producto: eq.codigo || eq.producto || eq.ref || eq.nom,
              cant: parseInt(eq.cantidad || eq.cant) || 1,
              precioUnitario: parseFloat(eq.valorUnitario || eq.precioUnitario) || 0,
              desc: parseFloat(eq.descuento || eq.desc) || 0,
              serialEquipo: eq.serialEquipo || null
            }));
          }
          if (!itemsRaw || itemsRaw.length === 0) {
            itemsRaw = [{
              productoId: item.productoId || item.idProd,
              producto: item.producto,
              cant: parseInt(item.cant) || 1,
              precioUnitario: parseFloat(item.precioUnitario) || parseFloat(item.total) || 0,
              desc: parseFloat(item.desc) || 0,
              serialEquipo: item.serialEquipo || null
            }];
          }

          for (const i of itemsRaw) {
            const prod = await resolveProduct(i.productoId || i.idProd, i.producto);
            if (prod) {
              await tx.cotizacionItem.create({
                data: {
                  cotizacionId: item.id,
                  productoId: prod.id,
                  cant: parseInt(i.cant) || 1,
                  precioUnitario: parseFloat(i.precioUnitario) || 0,
                  desc: parseFloat(i.desc) || 0
                }
              });
            }
          }
        }
      }

      // 7. PQRS
      if (diff.pqrs) {
        await flatDelete('pQR', diff.pqrs.deleted || []);

        for (const item of diff.pqrs.upserted || []) {
          const client = await resolveClient(item.docCli, item.clienteId, item.cliente);
          
          let asigId = null;
          if (item.usuarioAsignadoId) {
            const userById = await tx.user.findUnique({ where: { id: String(item.usuarioAsignadoId) } });
            if (userById) asigId = userById.id;
          }
          if (!asigId && item.usuarioAsignado) {
            const users = await getUsersCache();
            const asigStr = String(item.usuarioAsignado).trim();
            const userMatch = users.find(u => 
              u.user?.toLowerCase() === asigStr.toLowerCase() || 
              u.id === asigStr || 
              (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === asigStr.toLowerCase()
            );
            if (userMatch) asigId = userMatch.id;
          }

          let invId = null;
          if (item.inventarioId) {
            const invExists = await tx.inventario.findUnique({ where: { id: String(item.inventarioId) } });
            if (invExists) invId = invExists.id;
          }

          let vtaId = null;
          if (item.ventaId) {
            const vtaExists = await tx.venta.findUnique({ where: { id: String(item.ventaId) } });
            if (vtaExists) vtaId = vtaExists.id;
          }

          let cotId = null;
          if (item.cotizacionId) {
            const cotExists = await tx.cotizacion.findUnique({ where: { id: String(item.cotizacionId) } });
            if (cotExists) cotId = cotExists.id;
          }

          const pData = sanitizeBackendForPrisma('pqr', {
            ...item,
            clienteId: client.id,
            usuarioAsignadoId: asigId,
            inventarioId: invId,
            ventaId: vtaId,
            cotizacionId: cotId
          });

          const { id: idToUpsert, ...updateData } = pData;
          await tx.pQR.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 8. Servicios Técnicos
      if (diff.servicios) {
        await flatDelete('servicio', diff.servicios.deleted || []);

        for (const item of diff.servicios.upserted || []) {
          const client = await resolveClient(item.docCli, item.clienteId, item.cliente);
          
          let techId = null;
          if (item.tecnicoId) {
            const userById = await tx.user.findUnique({ where: { id: String(item.tecnicoId) } });
            if (userById) techId = userById.id;
          }
          if (!techId && item.tecnico) {
            const firstTech = String(item.tecnico).split(',')[0].trim();
            const users = await getUsersCache();
            const userMatch = users.find(u => 
              u.user?.toLowerCase() === firstTech.toLowerCase() || 
              (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === firstTech.toLowerCase()
            );
            if (userMatch) techId = userMatch.id;
          }

          let invId = null;
          if (item.inventarioId) {
            const invExists = await tx.inventario.findUnique({ where: { id: String(item.inventarioId) } });
            if (invExists) invId = invExists.id;
          }

          let vtaId = null;
          if (item.ventaId) {
            const vtaExists = await tx.venta.findUnique({ where: { id: String(item.ventaId) } });
            if (vtaExists) vtaId = vtaExists.id;
          }

          let cotId = null;
          if (item.cotizacionId) {
            const cotExists = await tx.cotizacion.findUnique({ where: { id: String(item.cotizacionId) } });
            if (cotExists) cotId = cotExists.id;
          }

          const sData = sanitizeBackendForPrisma('servicio', {
            ...item,
            clienteId: client.id,
            tecnicoId: techId,
            inventarioId: invId,
            ventaId: vtaId,
            cotizacionId: cotId
          });

          const { id: idToUpsert, ...updateData } = sData;
          await tx.servicio.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // --- FASE 3: Otras Tablas y Recursos Humanos ---

      // 9. Solicitudes Laborales
      if (diff.solicitudes) {
        await flatDelete('solicitud', diff.solicitudes.deleted || []);
        for (const item of diff.solicitudes.upserted || []) {
          let asId = null;
          if (item.asesorId) {
            const userById = await tx.user.findUnique({ where: { id: String(item.asesorId) } });
            if (userById) asId = userById.id;
          }
          if (!asId && item.asesor) {
            const users = await getUsersCache();
            const asStr = String(item.asesor).trim();
            const userMatch = users.find(u => 
              u.user?.toLowerCase() === asStr.toLowerCase() || 
              u.id === asStr || 
              (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === asStr.toLowerCase()
            );
            if (userMatch) asId = userMatch.id;
          }
          if (!asId && req.user?.id) {
            asId = req.user.id;
          }
          if (!asId) {
            const users = await getUsersCache();
            asId = users[0]?.id || '1';
          }

          const solData = sanitizeBackendForPrisma('solicitud', { ...item, asesorId: asId });
          const { id: idToUpsert, ...updateData } = solData;
          await tx.solicitud.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 10. Procesos Disciplinarios
      if (diff.procesosDisciplinarios) {
        await flatDelete('procesoDisciplinario', diff.procesosDisciplinarios.deleted || []);
        for (const item of diff.procesosDisciplinarios.upserted || []) {
          // Resolución robusta de asesorId
          let asId = null;
          if (item.asesorId) {
            const u = await tx.user.findUnique({ where: { id: String(item.asesorId) } });
            if (u) asId = u.id;
          }
          if (!asId && item.asesor) {
            const users = await getUsersCache();
            const asStr = String(item.asesor).trim();
            const u = users.find(x => 
              x.user?.toLowerCase() === asStr.toLowerCase() || 
              x.id === asStr ||
              (`${x.nombre} ${x.apellido || ''}`).trim().toLowerCase() === asStr.toLowerCase()
            );
            if (u) asId = u.id;
          }
          if (!asId) {
            asId = req.user?.id || (await getUsersCache())[0]?.id;
          }

          // Resolución de jefeId
          let jId = null;
          if (item.jefeId) {
            const uj = await tx.user.findUnique({ where: { id: String(item.jefeId) } });
            if (uj) jId = uj.id;
          }
          if (!jId && item.jefe && item.jefe !== 'Admin') {
            const users = await getUsersCache();
            const jStr = String(item.jefe).trim();
            const uj = users.find(x => 
              x.user?.toLowerCase() === jStr.toLowerCase() || 
              x.id === jStr ||
              (`${x.nombre} ${x.apellido || ''}`).trim().toLowerCase() === jStr.toLowerCase()
            );
            if (uj) jId = uj.id;
          }

          const procData = sanitizeBackendForPrisma('procesoDisciplinario', { ...item, asesorId: asId, jefeId: jId });
          const { id: idToUpsert, ...updateData } = procData;

          await tx.procesoDisciplinario.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 11. Evaluaciones de Desempeño
      if (diff.evaluaciones) {
        await flatDelete('evaluacion', diff.evaluaciones.deleted || []);
        for (const item of diff.evaluaciones.upserted || []) {
          let evdrId = null;
          if (item.evaluadorId) {
            const u = await tx.user.findUnique({ where: { id: String(item.evaluadorId) } });
            if (u) evdrId = u.id;
          }
          if (!evdrId && item.evaluador) {
            const users = await getUsersCache();
            const uStr = String(item.evaluador).trim();
            const uMatch = users.find(u => 
              u.user?.toLowerCase() === uStr.toLowerCase() || 
              u.id === uStr || 
              (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === uStr.toLowerCase()
            );
            if (uMatch) evdrId = uMatch.id;
          }
          if (!evdrId && req.user?.id) {
            evdrId = req.user.id;
          }

          let evdoId = null;
          let targetNombre = item.evaluadoNombre || null;
          if (item.evaluadoId) {
            const u = await tx.user.findUnique({ where: { id: String(item.evaluadoId) } });
            if (u) {
              evdoId = u.id;
              if (!targetNombre) targetNombre = `${u.nombre} ${u.apellido || ''}`.trim();
            }
          }
          const targetStr = item.evaluado || item.empleado;
          if (!evdoId && targetStr) {
            const users = await getUsersCache();
            const tStr = String(targetStr).trim();
            const uMatch = users.find(u => 
              u.user?.toLowerCase() === tStr.toLowerCase() || 
              u.id === tStr || 
              (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === tStr.toLowerCase()
            );
            if (uMatch) {
              evdoId = uMatch.id;
              if (!targetNombre) targetNombre = `${uMatch.nombre} ${uMatch.apellido || ''}`.trim();
            }
          }

          const evData = sanitizeBackendForPrisma('evaluacion', { 
            ...item, 
            evaluadorId: evdrId, 
            evaluadoId: evdoId,
            evaluadoNombre: targetNombre
          });
          const { id: idToUpsert, ...updateData } = evData;
          await tx.evaluacion.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 12. Comunicados Oficiales (Anuncios)
      if (diff.anuncios || diff.comunicados) {
        const annDiff = diff.anuncios || diff.comunicados;
        await flatDelete('anuncio', annDiff.deleted || []);
        await flatUpsert('anuncio', annDiff.upserted || []);
      }

      // 13. Chat Interno
      if (diff.chat) {
        await flatDelete('chat', diff.chat.deleted || []);
        for (const item of diff.chat.upserted || []) {
          let sndId = await resolveUser(item.senderId || item.user || item.sender);
          if (!sndId) sndId = req.user?.id || (await getUsersCache())[0]?.id;

          const toStr = item.to ? String(item.to).trim() : '';
          const isTodos = !toStr || toStr.toLowerCase() === 'todos';
          let rcvId = null;
          let tabId = item.senderTabId || null;

          if (!isTodos) {
            rcvId = await resolveUser(toStr || item.receiverId, false);
            if (!rcvId) {
              // Si no es un usuario directo, es un grupo de chat
              tabId = toStr;
            }
          }

          const chData = sanitizeBackendForPrisma('chat', { ...item, senderId: sndId, receiverId: rcvId, senderTabId: tabId });
          const { id: idToUpsert, ...updateData } = chData;

          await tx.chat.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 13.5 Grupos de Chat
      if (diff.chatGroups) {
        await flatDelete('chatGroup', diff.chatGroups.deleted || []);
        for (const item of diff.chatGroups.upserted || []) {
          let crId = await resolveUser(item.createdById || item.createdBy);
          if (!crId) crId = req.user?.id || (await getUsersCache())[0]?.id;

          const cgData = sanitizeBackendForPrisma('chatGroup', { ...item, createdById: crId });
          const { id: idToUpsert, ...updateData } = cgData;

          await tx.chatGroup.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 14. Auditoría
      if (diff.auditoria) {
        await flatDelete('auditoria', diff.auditoria.deleted || []);
        for (const item of diff.auditoria.upserted || []) {
          let uId = await resolveUser(item.userId || item.user);
          if (!uId) uId = req.user?.id || (await getUsersCache())[0]?.id;

          const audData = sanitizeBackendForPrisma('auditoria', { ...item, userId: uId });
          const idToUpsert = item.id || Date.now().toString() + '_' + Math.random().toString(36).substr(2, 7);
          const { id: _ignoreId, ...updateData } = audData;
          await tx.auditoria.upsert({
            where: { id: idToUpsert },
            update: updateData,
            create: { id: idToUpsert, ...updateData },
          });
        }
      }

      // 15. Notificaciones
      if (diff.notificaciones) {
        await flatDelete('notificacion', diff.notificaciones.deleted || []);
        for (const item of diff.notificaciones.upserted || []) {
          let pId = await resolveUser(item.paraId || item.para);
          if (!pId) pId = req.user?.id || (await getUsersCache())[0]?.id;

          const notData = sanitizeBackendForPrisma('notificacion', { ...item, paraId: pId });
          const idToUpsert = item.id || Date.now().toString() + '_' + Math.random().toString(36).substr(2, 7);
          const { id: _ignoreId, ...updateData } = notData;
          await tx.notificacion.upsert({
            where: { id: idToUpsert },
            update: updateData,
            create: { id: idToUpsert, ...updateData },
          });
        }
      }

      // 16. Comisionistas
      if (diff.comisionistas) {
        if (diff.comisionistas.deleted && diff.comisionistas.deleted.length > 0) {
          const comIds = diff.comisionistas.deleted.map(id => id.toString());
          await tx.venta.updateMany({
            where: { comisionistaId: { in: comIds } },
            data: { comisionistaId: null }
          });
          await flatDelete('comisionista', comIds);
        }

        for (const item of diff.comisionistas.upserted || []) {
          let owId = null;
          if (item.ownerId) {
            const userById = await tx.user.findUnique({ where: { id: String(item.ownerId) } });
            if (userById) owId = userById.id;
          }
          if (!owId && item.owner) {
            const users = await getUsersCache();
            const owStr = String(item.owner).trim();
            const userMatch = users.find(u => 
              u.user?.toLowerCase() === owStr.toLowerCase() || 
              u.id === owStr || 
              (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === owStr.toLowerCase()
            );
            if (userMatch) owId = userMatch.id;
          }

          const comData = sanitizeBackendForPrisma('comisionista', { ...item, ownerId: owId });
          const { id: idToUpsert, ...updateData } = comData;

          await tx.comisionista.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 17. Cuentas de Cobro
      if (diff.cuentasCobro) {
        await flatDelete('cuentasCobro', diff.cuentasCobro.deleted || []);
        await flatUpsert('cuentasCobro', diff.cuentasCobro.upserted || []);
      }

      // 18. Capacitaciones
      if (diff.capacitaciones) {
        await flatDelete('capacitacion', diff.capacitaciones.deleted || []);
        for (const item of diff.capacitaciones.upserted || []) {
          // Resolución robusta de creadorId
          let crId = null;
          if (item.creadorId) {
            const u = await tx.user.findUnique({ where: { id: String(item.creadorId) } });
            if (u) crId = u.id;
          }
          if (!crId && item.creador) {
            const users = await getUsersCache();
            const crStr = String(item.creador).trim();
            const u = users.find(x => 
              x.user?.toLowerCase() === crStr.toLowerCase() || 
              x.id === crStr ||
              (`${x.nombre} ${x.apellido || ''}`).trim().toLowerCase() === crStr.toLowerCase()
            );
            if (u) crId = u.id;
          }
          if (!crId) {
            crId = req.user?.id || (await getUsersCache())[0]?.id;
          }

          const capData = sanitizeBackendForPrisma('capacitacion', { ...item, creadorId: crId });
          const { id: idToUpsert, ...updateData } = capData;

          await tx.capacitacion.upsert({
            where: { id: idToUpsert || item.id },
            update: updateData,
            create: { id: idToUpsert || item.id, ...updateData },
          });
        }
      }

      // 19. PendingResets
      if (diff.pendingResets) {
        await flatUpsert('pendingReset', diff.pendingResets.upserted || []);
        await flatDelete('pendingReset', diff.pendingResets.deleted || []);
      }

      // 20. Configuración Global (WhatsApp e Informes)
      const configVal = (diff.config && diff.config.value) 
        ? diff.config.value 
        : (diff.config && (diff.config.whatsapp || diff.config.informes) 
            ? diff.config 
            : (Array.isArray(diff.config?.upserted) && diff.config.upserted.length > 0 ? diff.config.upserted[0] : null));

      const whatsappVal = configVal?.whatsapp 
        || (Array.isArray(diff.whatsappConfig?.upserted) && diff.whatsappConfig.upserted.length > 0 
            ? diff.whatsappConfig.upserted[0] 
            : (diff.whatsappConfig?.value || (diff.whatsappConfig?.phone ? diff.whatsappConfig : null)));

      const informesVal = configVal?.informes 
        || (Array.isArray(diff.informesConfig?.upserted) && diff.informesConfig.upserted.length > 0 
            ? diff.informesConfig.upserted[0] 
            : (diff.informesConfig?.value || (diff.informesConfig?.margenOperativo !== undefined || diff.informesConfig?.diasHabilesMes !== undefined ? diff.informesConfig : null)));

      if (whatsappVal) {
        const cleanWp = sanitizeBackendForPrisma('whatsappConfig', whatsappVal);
        const { id: _id, ...wpData } = cleanWp;
        await tx.whatsappConfig.upsert({
          where: { id: 1 },
          update: wpData,
          create: { id: 1, ...wpData },
        });
      }

      if (informesVal) {
        const cleanInf = sanitizeBackendForPrisma('informesConfig', informesVal);
        const { id: _id, ...infData } = cleanInf;
        await tx.informesConfig.upsert({
          where: { id: 1 },
          update: infData,
          create: { id: 1, ...infData },
        });
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
io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
        callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
});
app.set('io', io);

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
      const uStr = String(data.user).trim();
      socket.join(uStr);
      socket.join(uStr.toLowerCase());
      onlineUsers.set(socket.id, uStr);
      broadcastOnlineUsers();
      console.log(`User ${uStr} joined personal room`);
      try {
        await prisma.user.updateMany({
          where: { user: { equals: uStr, mode: 'insensitive' } },
          data: { isOnline: true }
        });
        broadcastUpdate('DB_UPDATE');
      } catch (err) {
        console.error("Error setting isOnline true:", err);
      }
    }
  });

  socket.on('join_group', (groupId) => {
    if (groupId) {
      const gStr = String(groupId).trim();
      socket.join(gStr);
      socket.join(gStr.toLowerCase());
      console.log(`Socket joined group ${gStr}`);
    }
  });

  socket.on('send_message', async (messageData) => {
    if (!messageData || !messageData.to) return;
    const toTarget = String(messageData.to).trim();
    if (toTarget.toLowerCase() === 'todos') {
      socket.broadcast.emit('receive_message', messageData);
      return;
    }

    const targetRooms = new Set();
    targetRooms.add(toTarget);
    targetRooms.add(toTarget.toLowerCase());

    try {
      const group = await prisma.chatGroup.findFirst({
        where: { id: toTarget }
      });
      if (group && group.integrantes) {
        const members = Array.isArray(group.integrantes) ? group.integrantes : [];
        members.forEach(item => {
          const uName = typeof item === 'string' ? item : (item.user || item.username || item.id);
          if (uName && String(uName).toLowerCase() !== String(messageData.user || '').toLowerCase()) {
            targetRooms.add(String(uName).trim());
            targetRooms.add(String(uName).trim().toLowerCase());
          }
        });
      }
    } catch (e) {
      console.error('[send_message] Group routing error:', e.message);
    }

    if (messageData.user) {
      targetRooms.delete(String(messageData.user).trim());
      targetRooms.delete(String(messageData.user).trim().toLowerCase());
    }

    const uniqueRooms = Array.from(targetRooms).filter(Boolean);
    if (uniqueRooms.length > 0) {
      socket.to(uniqueRooms).emit('receive_message', messageData);
    }
  });

  socket.on('send_nudge', async (data) => {
    if (!data || !data.to) return;
    const toTarget = String(data.to).trim();
    if (toTarget.toLowerCase() === 'todos') {
      socket.broadcast.emit('receive_nudge', data);
      return;
    }

    const targetRooms = new Set();
    targetRooms.add(toTarget);
    targetRooms.add(toTarget.toLowerCase());

    try {
      const group = await prisma.chatGroup.findFirst({
        where: { id: toTarget }
      });
      if (group && group.integrantes) {
        const members = Array.isArray(group.integrantes) ? group.integrantes : [];
        members.forEach(item => {
          const uName = typeof item === 'string' ? item : (item.user || item.username || item.id);
          if (uName && String(uName).toLowerCase() !== String(data.user || '').toLowerCase()) {
            targetRooms.add(String(uName).trim());
            targetRooms.add(String(uName).trim().toLowerCase());
          }
        });
      }
    } catch (e) {
      console.error('[send_nudge] Group routing error:', e.message);
    }

    if (data.user) {
      targetRooms.delete(String(data.user).trim());
      targetRooms.delete(String(data.user).trim().toLowerCase());
    }

    const uniqueRooms = Array.from(targetRooms).filter(Boolean);
    if (uniqueRooms.length > 0) {
      socket.to(uniqueRooms).emit('receive_nudge', data);
    }
  });

  socket.on('typing', (data) => {
     if (data.to) {
         socket.to(data.to).emit('typing', data);
     }
  });

  socket.on('message_reaction', (data) => {
     if (data.to === 'Todos') {
         socket.broadcast.emit('message_reaction', data);
     } else if (data.to) {
         socket.to(data.to).emit('message_reaction', data);
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
