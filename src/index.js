const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { askGemini, geminiLogs } = require('./geminiService');
const { sendRecoveryEmail, verifySmtpConnection } = require('./emailService');

const app = express();
app.use(cors());
// Incrementar límite de tamaño para soportar imágenes en Base64 en solicitudes/PQRS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Endpoint de prueba de estado
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// POST /api/login: Autenticación de usuario con bcrypt
app.post('/api/login', async (req, res) => {
  const { user, pass } = req.body;
  console.log(`[LOGIN ATTEMPT] User: "${user}"`);
  if (!user || !pass) {
    console.log(`[LOGIN FAILED] Missing user or pass`);
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  try {
    const dbUser = await prisma.user.findFirst({
      where: { user: { equals: user, mode: 'insensitive' } }
    });

    if (!dbUser) {
      console.log(`[LOGIN FAILED] User "${user}" not found in database`);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const matches = bcrypt.compareSync(pass, dbUser.pass);
    console.log(`[LOGIN COMPARE] User found: "${dbUser.user}". Password matches: ${matches}`);

    if (matches) {
      return res.json({ success: true, user: dbUser });
    } else {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno en el servidor de autenticación' });
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
        message: 'No se pudo despachar el correo (falló la conexión SMTP de Google). Aquí tienes tu enlace directo para restablecer la contraseña:'
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
      lockedBy: p.lockedBy
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
      lockedBy: s.lockedBy
    }));

    const solicitudes = await prisma.solicitud.findMany({ orderBy: { id: 'asc' } });
    const procesosDisciplinarios = await prisma.procesoDisciplinario.findMany({ orderBy: { id: 'asc' } });
    const evaluaciones = await prisma.evaluacion.findMany({ orderBy: { id: 'asc' } });
    const anuncios = await prisma.anuncio.findMany({ orderBy: { id: 'asc' } });

    // Mapear Cotizaciones
    const cotizacionesRaw = await prisma.cotizacion.findMany({
      include: { cliente: true, producto: true },
      orderBy: { id: 'asc' }
    });
    const cotizaciones = cotizacionesRaw.map(c => ({
      id: c.id,
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
      lockedBy: c.lockedBy
    }));

    const chat = await prisma.chat.findMany({ orderBy: { timestamp: 'asc' } });
    const auditoria = await prisma.auditoria.findMany({ orderBy: { id: 'asc' } });
    const notificaciones = await prisma.notificacion.findMany({ orderBy: { id: 'asc' } });
    const comisionistas = await prisma.comisionista.findMany({ orderBy: { id: 'asc' } });

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

// POST /api/db/sync: Procesa el diff incremental del cliente
app.post('/api/db/sync', async (req, res) => {
  const { diff } = req.body;
  if (!diff) {
    return res.status(400).json({ error: 'No diff payload provided' });
  }

  try {
    // Helper para upserts en tablas planas directas
    const flatUpsert = async (table, items) => {
      for (const item of items) {
        const { ...data } = item;

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
        const product = await prisma.inventario.findFirst({
          where: { OR: [{ id: item.idProd }, { ref: item.producto }] }
        });

        if (!client || !product) {
          console.error(`Sync Cotizacion ${item.id} fallida: Cliente o Producto no encontrado.`);
          continue;
        }

        const data = {
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

    res.json({ success: true });
  } catch (error) {
    console.error('Error syncing database:', error);
    res.status(500).json({ error: 'Error al sincronizar la base de datos', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  verifySmtpConnection();
});
