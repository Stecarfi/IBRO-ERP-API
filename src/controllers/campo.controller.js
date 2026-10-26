const prisma = require('../prisma');
const jornadaService = require('../services/campo/jornada.service');
const trackingService = require('../services/campo/tracking.service');
const visitasService = require('../services/campo/visitas.service');
const productividadService = require('../services/campo/productividad.service');
const actividadesService = require('../services/campo/actividades.service');
const evidenciasService = require('../services/campo/evidencias.service');
const reportesService = require('../services/campo/reportes.service');
const evaluacionesCampoService = require('../services/campo/evaluacionesCampo.service');
const operacionExternaService = require('../services/campo/operacionExterna.service');
const auditoriaService = require('../services/auditoria.service');
const {
  iniciarJornadaSchema,
  pausaJornadaSchema,
  reanudarJornadaSchema,
  finalizarJornadaSchema,
  pingUbicacionSchema,
  batchUbicacionesSchema,
  checkInVisitaSchema,
  checkOutVisitaSchema,
  prospectoCampoSchema,
  programarVisitaSchema,
  geocercaSchema,
  zonaComercialSchema
} = require('../validators/campo.validators');

// Helpers de zona horaria oficial Colombia (America/Bogota / UTC-5)
const parseColombiaDateTime = (fechaStr, horaStr) => {
  if (horaStr instanceof Date && !isNaN(horaStr.getTime())) {
    return horaStr;
  }
  if (typeof horaStr === 'string') {
    const s = horaStr.trim();
    if (s.endsWith('Z') || (s.includes('T') && (s.includes('+') || s.includes('-')))) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
    }
  }

  let f = fechaStr;
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  } else if (f instanceof Date) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(f);
  } else if (typeof f === 'string') {
    if (f.includes('T')) f = f.split('T')[0];
    f = f.trim();
  }

  let h = horaStr;
  if (!h || (typeof h !== 'string' && !(h instanceof Date))) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const hh = parts.find(p => p.type === 'hour')?.value || '12';
    const mm = parts.find(p => p.type === 'minute')?.value || '00';
    h = `${hh}:${mm}`;
  } else if (h instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(h);
    const hh = parts.find(p => p.type === 'hour')?.value || '12';
    const mm = parts.find(p => p.type === 'minute')?.value || '00';
    h = `${hh}:${mm}`;
  } else if (typeof h === 'string') {
    h = h.trim();
    if (h.includes('T')) {
      h = h.split('T')[1].replace(/Z|[+-].*$/, '');
    }
  }

  let isPM = false;
  let isAM = false;
  if (typeof h === 'string') {
    if (/pm/i.test(h)) isPM = true;
    if (/am/i.test(h)) isAM = true;
    h = h.replace(/[^\d:]/g, '');
  }

  const [rawH, rawM, rawS] = String(h).split(':');
  let intH = parseInt(rawH, 10) || 0;
  const intM = parseInt(rawM, 10) || 0;
  const intS = parseInt(rawS, 10) || 0;

  if (isPM && intH < 12) intH += 12;
  if (isAM && intH === 12) intH = 0;

  const hPad = String(intH).padStart(2, '0');
  const mPad = String(intM).padStart(2, '0');
  const sPad = String(intS).padStart(2, '0');

  return new Date(`${f}T${hPad}:${mPad}:${sPad}-05:00`);
};

const getFechaColombia = (date = new Date()) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

const getHoraColombia = (date = new Date()) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const h = parts.find(p => p.type === 'hour')?.value || '00';
  const m = parts.find(p => p.type === 'minute')?.value || '00';
  return `${h}:${m}`;
};

const formatHoraColombia = (dateVal) => {
  if (!dateVal) return '--:--';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
};

const getColombiaDayBounds = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const colombiaStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
  const startOfDay = new Date(`${colombiaStr}T00:00:00-05:00`);
  const endOfDay = new Date(`${colombiaStr}T23:59:59.999-05:00`);
  return { startOfDay, endOfDay, colombiaStr };
};

const autoCerrarJornadasVencidas = async (prismaInstance) => {
  try {
    const ahora = new Date();
    const { startOfDay } = getColombiaDayBounds(ahora);

    // Cierre estricto e irrevocable de cualquier turno de días anteriores que haya quedado abierto
    await prismaInstance.jornadaLaboral.updateMany({
      where: {
        horaFin: null,
        horaInicio: { lt: startOfDay },
        estado: { in: ['Iniciada', 'En Pausa', 'En Ruta', 'Activa'] }
      },
      data: {
        estado: 'Cierre Automatico',
        horaFin: startOfDay,
        observaciones: 'Cierre automático por cambio de fecha calendario (Auditoría)'
      }
    });
  } catch (err) {
    console.warn('[autoCerrarJornadasVencidas] Advertencia en auto-cierre:', err?.message);
  }
};

class CampoController {
  // Helper de permisos del Delegado de Gerencia (estrictamente por atributo del usuario, rol directivo o Master Admin)
  esDelegado(user) {
    if (!user) return false;
    // 1. Atributo explícito asignado al usuario desde Administración de Usuarios
    if (user.esDelegadoGerencia === true || user.esDelegadoGerencia === 'true') return true;
    // 2. Administradores Master y usuarios raíz
    const roleId = String(user.roleId || user.role?.id || '');
    const userName = String(user.user || '').toLowerCase();
    if (roleId === '1' || userName === 'admin' || userName === 'asiadm' || userName === 'stecarfi05') return true;
    // 3. Dirección Comercial y Gerencia
    if (userName === 'dircomercial') return true;
    const cargo = String(user.cargo || '').toLowerCase();
    const roleName = String(user.role?.name || user.roleName || user.role || '').toLowerCase();
    if (
      cargo.includes('delegad') ||
      cargo.includes('gerent') ||
      cargo.includes('director') ||
      roleName.includes('delegad') ||
      roleName.includes('gerent') ||
      roleName.includes('director') ||
      roleName.includes('master') ||
      roleName.includes('administrador')
    ) {
      return true;
    }
    return false;
  }

  // Helper de permisos de Comercial en Campo (estrictamente por atributo del usuario)
  esComercial(user) {
    if (!user) return false;
    return user.esComercialCampo === true || user.esComercialCampo === 'true';
  }

  // Helper de auditoría inmutable
  async registrarAuditoria(userId, action, recordDetails, shadowingData = null, req = null) {
    try {
      const ip = req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1';
      await prisma.auditoria.create({
        data: {
          userId,
          fecha: new Date(),
          action,
          modulo: 'operaciones_campo',
          recordDetails: typeof recordDetails === 'object' ? JSON.stringify(recordDetails) : String(recordDetails),
          shadowingData: {
            ip,
            ...(typeof shadowingData === 'object' && shadowingData !== null ? shadowingData : { meta: shadowingData })
          },
          hash: Buffer.from(`${Date.now()}_${action}_${userId}`).toString('base64')
        }
      });
    } catch (e) {
      console.error('[Auditoria Error]', e.message);
    }
  }

  // Helper para devolver mensajes de error amigables sin volcar JSON técnico
  formatearError(err, mensajePorDefecto = 'Error al procesar la solicitud.') {
    if (err?.errors && Array.isArray(err.errors)) {
      const items = err.errors.map(e => {
        const campo = e.path && e.path.length > 0 ? `El campo '${e.path.join('.')}'` : 'La solicitud';
        if (e.code === 'invalid_type' && e.received === 'undefined') {
          return `${campo} es requerido.`;
        }
        return e.message || 'Dato inválido.';
      });
      return items.join(' ');
    }
    if (typeof err?.message === 'string') {
      if (err.message.startsWith('[') && err.message.includes('invalid_type')) {
        return 'Los datos suministrados son incompletos o inválidos.';
      }
      return err.message;
    }
    return mensajePorDefecto;
  }

  // --- JORNADA ---
  async iniciarJornada(req, res) {
    try {
      const parsed = iniciarJornadaSchema.parse(req.body || {});
      const result = await jornadaService.iniciarJornada(req.user.id, parsed);
      if (!result.success) {
        return res.status(400).json(result);
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          isOnline: true,
          lat: parseFloat(parsed.lat),
          lng: parseFloat(parsed.lng),
          lastLocationUpdate: Date.now()
        }
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_JORNADA_UPDATE', {
          accion: 'INICIO',
          usuarioId: req.user.id,
          usuarioNombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.user,
          jornada: result.jornada,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_JORNADA_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_INICIO', {
        jornadaId: result.jornada.id,
        lat: parsed.lat,
        lng: parsed.lng
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: this.formatearError(err, 'No fue posible iniciar el turno laboral.') });
    }
  }

  async iniciarPausa(req, res) {
    try {
      const parsed = pausaJornadaSchema.parse(req.body || {});
      const result = await jornadaService.iniciarPausa(req.user.id, parsed);
      if (!result.success) return res.status(400).json(result);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_JORNADA_UPDATE', {
          accion: 'PAUSA',
          usuarioId: req.user.id,
          tipo: parsed.tipo,
          timestamp: Date.now()
        });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_PAUSA', parsed);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: this.formatearError(err, 'No fue posible pausar la jornada.') });
    }
  }

  async reanudarPausa(req, res) {
    try {
      const parsed = reanudarJornadaSchema.parse(req.body || {});
      const result = await jornadaService.reanudarPausa(req.user.id, parsed);
      if (!result.success) return res.status(400).json(result);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_JORNADA_UPDATE', {
          accion: 'REANUDAR',
          usuarioId: req.user.id,
          timestamp: Date.now()
        });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_REANUDAR', parsed);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: this.formatearError(err, 'No fue posible reanudar la jornada.') });
    }
  }

  async finalizarJornada(req, res) {
    try {
      const parsed = finalizarJornadaSchema.parse(req.body || {});
      const result = await jornadaService.finalizarJornada(req.user.id, parsed);
      if (!result.success) return res.status(400).json(result);

      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          isOnline: false,
          lastLocationUpdate: Date.now()
        }
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_JORNADA_UPDATE', {
          accion: 'FIN',
          usuarioId: req.user.id,
          usuarioNombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.user,
          jornada: result.jornada,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_JORNADA_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_FIN', {
        jornadaId: parsed.jornadaId,
        tiempoTotalMin: result.jornada?.tiempoTotalMin,
        distanciaKm: result.jornada?.distanciaKm
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: this.formatearError(err, 'No fue posible finalizar la jornada laboral.') });
    }
  }

  async getJornadaActiva(req, res) {
    try {
      const jornada = await jornadaService.getJornadaActiva(req.user.id);
      res.json({ jornada });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- TELEMETRÍA Y TRACKING ---
  async pingUbicacion(req, res) {
    try {
      const parsed = pingUbicacionSchema.parse(req.body);
      const io = req.app?.get('io');
      const breadcrumb = await trackingService.registrarPing(req.user.id, parsed, io);
      res.json({ success: true, breadcrumb });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async batchUbicaciones(req, res) {
    try {
      const parsed = batchUbicacionesSchema.parse(req.body);
      const io = req.app?.get('io');
      const result = await trackingService.registrarBatch(req.user.id, parsed.puntos, io);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async getHistorialRecorrido(req, res) {
    try {
      const { usuarioId } = req.params;
      const { fecha } = req.query;
      const historial = await trackingService.getHistorialRecorrido(usuarioId || req.user.id, fecha);
      res.json(historial);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getUltimasUbicaciones(req, res) {
    try {
      const ubicaciones = await trackingService.getUltimasUbicacionesPersonal();
      res.json({ success: true, ubicaciones });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- VISITAS Y COMERCIAL ---
  async programarVisita(req, res) {
    try {
      const parsed = programarVisitaSchema.parse(req.body);
      const visita = await visitasService.programarVisita(req.user.id, parsed);

      await this.registrarAuditoria(req.user.id, 'CAMPO_VISITA_PROGRAMADA', {
        visitaId: visita.id,
        clienteId: parsed.clienteId,
        prospectoId: parsed.prospectoId
      });

      res.status(201).json({ success: true, visita });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async getAgenda(req, res) {
    try {
      const { fecha, usuarioId } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? (usuarioId && usuarioId !== 'TODOS' ? usuarioId : null) : req.user.id;
      const visitas = await visitasService.getAgendaUsuario(targetUserId, fecha, esDel);
      res.json(visitas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async checkInVisita(req, res) {
    try {
      const parsed = checkInVisitaSchema.parse(req.body);
      const io = req.app?.get('io');
      const result = await visitasService.checkIn(req.user.id, parsed, io);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_VISITA_CHECKIN', {
        visitaId: parsed.visitaId,
        distanciaMetros: result.distanciaMetros,
        alertaDesviacion: result.alertaDesviacion
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async checkOutVisita(req, res) {
    try {
      const parsed = checkOutVisitaSchema.parse(req.body);
      const io = req.app?.get ? req.app.get('io') : null;
      const evidencias = req.body.evidencias || req.body.fotosEvidencia || req.body.adjuntos || parsed.evidencias || [];
      const result = await visitasService.checkOut(req.user.id, {
        ...parsed,
        resultadoResumen: parsed.resultadoResumen || req.body.observaciones || req.body.resultadoVisita || 'Visita finalizada',
        resultadoVisita: parsed.resultadoVisita || req.body.resultadoVisita || 'Visita finalizada',
        observaciones: parsed.observaciones || req.body.observaciones || parsed.resultadoResumen || 'Visita finalizada',
        compromisos: parsed.compromisos || req.body.compromisos || '',
        evidencias: Array.isArray(evidencias) ? evidencias : (evidencias ? [evidencias] : [])
      }, io);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_VISITA_CHECKOUT', {
        visitaId: parsed.visitaId,
        duracionMin: result.visita ? result.visita.duracionMin : 0
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async crearProspecto(req, res) {
    try {
      const parsed = prospectoCampoSchema.parse(req.body);
      const prospecto = await visitasService.crearProspecto(req.user.id, parsed);

      await this.registrarAuditoria(req.user.id, 'CAMPO_PROSPECTO_CREADO', {
        prospectoId: prospecto.id,
        nombre: prospecto.nombreComercial
      });

      res.json({ success: true, prospecto });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async getProspectos(req, res) {
    try {
      const prospectos = await prisma.prospectoCampo.findMany({
        where: req.user.roleId === '1' ? {} : { creadoPorId: req.user.id },
        orderBy: { fechaCreacion: 'desc' }
      });
      res.json(prospectos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async convertirProspecto(req, res) {
    try {
      const { id } = req.params;
      const cliente = await visitasService.convertirACliente(id, req.user.id);

      await this.registrarAuditoria(req.user.id, 'CAMPO_PROSPECTO_CONVERTIDO', {
        prospectoId: id,
        clienteId: cliente.id
      });

      res.json({ success: true, cliente });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // --- PRODUCTIVIDAD ---
  async getDashboardProductividad(req, res) {
    try {
      const { periodo, usuarioId } = req.query;
      // Los asesores solo pueden ver sus propios indicadores; Gerencia/Dirección pueden ver global o filtrar
      const targetUser = (req.user.roleId === '1' || req.user.cargo?.toLowerCase().includes('gerenc') || req.user.cargo?.toLowerCase().includes('director'))
        ? usuarioId
        : req.user.id;

      const data = await productividadService.getDashboardProductividad(periodo, targetUser);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getRanking(req, res) {
    try {
      const { periodo } = req.query;
      const ranking = await productividadService.getRankingComercialCampo(periodo);
      res.json(ranking);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- GEOCERCAS Y ZONAS ---
  async getGeocercas(req, res) {
    try {
      const geocercas = await prisma.geocerca.findMany({
        where: { activo: true },
        include: { zona: true }
      });
      res.json(geocercas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async crearGeocerca(req, res) {
    try {
      const parsed = geocercaSchema.parse(req.body);
      const geocerca = await prisma.geocerca.create({ data: parsed });
      res.json({ success: true, geocerca });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async getZonas(req, res) {
    try {
      const zonas = await prisma.zonaComercial.findMany({
        where: { activo: true },
        include: { asignaciones: { include: { usuario: true } } }
      });
      res.json(zonas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async crearZona(req, res) {
    try {
      const parsed = zonaComercialSchema.parse(req.body);
      const zona = await prisma.zonaComercial.create({ data: parsed });
      res.json({ success: true, zona });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  // --- 3. ACTIVIDADES DEL DÍA ---
  async getActividades(req, res) {
    try {
      const result = await actividadesService.listarActividades(req.user.id, req.query, req.user.role, req.user);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async crearActividad(req, res) {
    try {
      const result = await actividadesService.crearActividad(req.user.id, req.body);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_ACTIVIDAD_CREAR', {
        actividadId: result.actividad.id,
        titulo: req.body.titulo
      });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'CREAR', actividad: result.actividad, tarea: result.actividad });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'CREAR', tarea: result.actividad, actividad: result.actividad });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarEstadoActividad(req, res) {
    try {
      const { id } = req.params;
      const result = await actividadesService.actualizarEstado(req.user.id, id, req.body);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_ACTIVIDAD_ESTADO', {
        actividadId: id,
        nuevoEstado: req.body.estado
      });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'ESTADO', actividad: result.actividad, tarea: result.actividad });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'ESTADO', tarea: result.actividad, actividad: result.actividad });
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'ESTADO', ruta: result.actividad });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async agregarComentarioActividad(req, res) {
    try {
      const { id } = req.params;
      const result = await actividadesService.agregarComentario(req.user.id, id, req.body.texto);
      if (!result.success) return res.status(400).json(result);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // --- 4. EVIDENCIAS MULTIMEDIA ---
  async getEvidencias(req, res) {
    try {
      const result = await evidenciasService.listarEvidencias(req.user.id, req.query, req.user.role, req.user);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async registrarEvidencia(req, res) {
    try {
      const result = await evidenciasService.registrarEvidencia(req.user.id, req.body);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_EVIDENCIA_CARGAR', {
        evidenciaId: result.evidencia.id,
        tipo: req.body.tipo,
        visitaId: req.body.visitaId
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // --- 5. SEGUIMIENTO CONTINUO ---
  async getSeguimientos(req, res) {
    try {
      const result = await evidenciasService.listarSeguimientos(req.user.id, req.query, req.user.role, req.user);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 8. REPORTES OPERATIVOS CONSOLIDADOS ---
  async getReportes(req, res) {
    try {
      const result = await reportesService.generarReporte(req.user.id, req.query, req.user.role, req.user);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 9. DELEGADO DE GERENCIA Y EVALUACIÓN DE DESEMPEÑO COMERCIAL ---
  async getDashboardDelegado(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido: Función exclusiva para el Delegado de Gerencia.' });
      }
      const data = await evaluacionesCampoService.getTableroDelegado(req.query.periodo);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getIndicadoresComercial(req, res) {
    try {
      const requestedId = req.params.usuarioId || req.query.usuarioId;
      let targetUserId = req.user.id;

      if (this.esDelegado(req.user)) {
        targetUserId = requestedId || req.user.id;
      } else {
        // Los cargos comerciales de campo (67, 68, 69) únicamente pueden consultar sus propios indicadores
        if (requestedId && requestedId !== req.user.id) {
          return res.status(403).json({ error: 'Acceso denegado: Solo puede visualizar sus propios indicadores comerciales.' });
        }
        targetUserId = req.user.id;
      }

      const data = await evaluacionesCampoService.calcularIndicadoresComercial(targetUserId, req.query.periodo);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async guardarEvaluacion(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Operación denegada: Solo el Delegado de Gerencia tiene facultades para calificar y emitir evaluaciones.' });
      }

      const usuarioIdEvaluado = req.body.usuarioId || req.body.comercialId || req.body.evaluadoId;
      if (!usuarioIdEvaluado) {
        return res.status(400).json({ error: 'Debe especificar el usuario a evaluar (usuarioId, comercialId o evaluadoId).' });
      }

      const evaluacion = await evaluacionesCampoService.guardarEvaluacion(req.user.id, {
        ...req.body,
        usuarioId: usuarioIdEvaluado
      });

      await this.registrarAuditoria(req.user.id, 'CAMPO_EVALUACION_EMITIDA', {
        evaluacionId: evaluacion.id,
        usuarioEvaluadoId: usuarioIdEvaluado,
        periodo: evaluacion.periodo,
        calificacionGeneral: evaluacion.calificacionGeneral,
        estadoCumplimiento: evaluacion.estadoCumplimiento
      }, {
        evaluadorNombre: `${req.user.nombre} ${req.user.apellido}`,
        accion: 'Calificación y Aprobación de Indicadores'
      }, req);

      res.status(201).json({ success: true, evaluacion });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getHistorialEvaluaciones(req, res) {
    try {
      let requestedId = req.params.usuarioId || req.query.usuarioId;
      if (requestedId === 'historial') requestedId = req.query.usuarioId || null;
      let targetUserId = null;

      if (this.esDelegado(req.user)) {
        targetUserId = requestedId || null;
      } else {
        targetUserId = req.user.id;
      }

      const evaluaciones = await evaluacionesCampoService.getHistorialEvaluaciones(targetUserId, req.query.periodo);
      res.json(evaluaciones);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 10. NOVEDADES Y SEGUIMIENTO DEL DELEGADO DE GERENCIA ---
  async crearNovedadDelegado(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede registrar novedades de supervisión.' });
      }

      const usuarioId = req.body.usuarioId || req.body.comercialId;
      if (!usuarioId) {
        return res.status(400).json({ error: 'Debe especificar el asesor o colaborador comercial involucrado.' });
      }

      const adjuntos = req.body.adjuntos || req.body.evidencias || [];
      const novedad = await evaluacionesCampoService.crearNovedadDelegado(req.user.id, {
        ...req.body,
        usuarioId,
        gravedad: req.body.prioridad || req.body.gravedad || 'Normal',
        metadata: {
          ...(typeof req.body.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : {}),
          adjuntos: Array.isArray(adjuntos) ? adjuntos : (adjuntos ? [adjuntos] : [])
        }
      });

      await this.registrarAuditoria(req.user.id, 'CAMPO_NOVEDAD_DELEGADO_CREADA', {
        novedadId: novedad.id,
        usuarioId,
        tipo: req.body.tipo,
        titulo: req.body.titulo
      }, {
        delegadoNombre: `${req.user.nombre} ${req.user.apellido}`
      }, req);

      res.status(201).json({ success: true, novedad });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getNovedadesComercial(req, res) {
    try {
      const targetUserId = req.params.usuarioId || req.query.usuarioId || null;

      if (!targetUserId) {
        // En ControlGerencial, se solicitan todas las novedades del equipo
        const novedades = await evaluacionesCampoService.getNovedadesComercial(null);
        return res.json({ success: true, novedades });
      }

      if (!this.esDelegado(req.user) && req.user.id !== targetUserId) {
        return res.status(403).json({ error: 'Acceso denegado.' });
      }

      const novedades = await evaluacionesCampoService.getNovedadesComercial(targetUserId);
      res.json({ success: true, novedades });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async actualizarEstadoNovedad(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Operación restringida al Delegado de Gerencia.' });
      }

      const { id } = req.params;
      const { estado, accionCorrectiva } = req.body;
      const actualizada = await evaluacionesCampoService.actualizarEstadoNovedad(id, estado, accionCorrectiva);
      res.json({ success: true, novedad: actualizada });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarNovedad(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede modificar novedades.' });
      }
      const { id } = req.params;
      const { titulo, descripcion, tipo, gravedad, prioridad, fechaCompromiso, accionCorrectiva, estado } = req.body;

      const novedad = await prisma.novedadDelegadoCampo.update({
        where: { id },
        data: {
          ...(titulo ? { titulo } : {}),
          ...(descripcion ? { descripcion } : {}),
          ...(tipo ? { tipo } : {}),
          ...(gravedad || prioridad ? { gravedad: gravedad || prioridad } : {}),
          ...(fechaCompromiso !== undefined ? { fechaCompromiso: fechaCompromiso ? new Date(fechaCompromiso) : null } : {}),
          ...(accionCorrectiva !== undefined ? { accionCorrectiva } : {}),
          ...(estado ? { estado } : {})
        },
        include: {
          delegado: { select: { id: true, nombre: true, apellido: true } },
          usuario: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_NOVEDAD_UPDATE', { accion: 'ACTUALIZAR', novedad, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_NOVEDAD_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, novedad });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarNovedad(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar novedades.' });
      }
      const { id } = req.params;
      await prisma.novedadDelegadoCampo.delete({ where: { id } });

      await this.registrarAuditoria(req.user.id, 'CAMPO_NOVEDAD_ELIMINADA', { novedadId: id }, null, req);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_NOVEDAD_UPDATE', { accion: 'ELIMINAR', id, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_NOVEDAD_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Novedad eliminada correctamente.' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarTodasNovedades(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar todas las novedades.' });
      }
      const { usuarioId } = req.query;
      const where = {};
      if (usuarioId && usuarioId !== 'TODOS') {
        where.usuarioId = usuarioId;
      }

      const result = await prisma.novedadDelegadoCampo.deleteMany({ where });

      await this.registrarAuditoria(req.user.id, 'CAMPO_TODAS_NOVEDADES_ELIMINADAS', {
        totalEliminadas: result.count,
        usuarioFiltro: usuarioId || 'TODOS'
      }, null, req);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_NOVEDAD_UPDATE', { accion: 'ELIMINAR_TODAS', timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_NOVEDAD_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, count: result.count, message: `Se eliminaron ${result.count} novedades correctamente.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 11. FICHA HISTÓRICA COMPLETA DEL COMERCIAL ---
  async getFichaHistorica(req, res) {
    try {
      const targetUserId = req.params.usuarioId || req.query.usuarioId || req.user.id;

      if (!this.esDelegado(req.user) && req.user.id !== targetUserId) {
        return res.status(403).json({ error: 'Acceso denegado: Solo puede consultar su propia ficha histórica.' });
      }

      const ficha = await evaluacionesCampoService.getFichaHistoricaComercial(targetUserId);
      res.json(ficha);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  getFiltroOperadoresCampo() {
    return {
      isLocked: false,
      esComercialCampo: true,
      esDelegadoGerencia: false,
      roleId: { not: '1' },
      user: { notIn: ['admin', 'ADMIN'] }
    };
  }

  async getComercialesEnCampo(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido al Delegado de Gerencia.' });
      }

      await autoCerrarJornadasVencidas(prisma);

      const ahora = new Date();
      const { startOfDay, endOfDay } = getColombiaDayBounds(ahora);

      // Consulta de presencia real conectada a la secuencia de inicio de sesión y telemetría
      let dataPresencia = null;
      try {
        dataPresencia = await auditoriaService.obtenerSesionesActivas(ahora);
      } catch (ePres) {
        console.warn('[getComercialesEnCampo] Error consultando auditoriaService:', ePres?.message);
      }
      const presenciaMap = new Map();
      (dataPresencia?.usuarios || []).forEach(p => {
        presenciaMap.set(String(p.id), p);
      });

      const comerciales = await prisma.user.findMany({
        where: this.getFiltroOperadoresCampo(),
        select: {
          id: true,
          nombre: true,
          apellido: true,
          user: true,
          cargo: true,
          roleId: true,
          codigoAsesor: true,
          foto: true,
          telefono: true,
          correo: true,
          meta_p: true,
          meta_u: true,
          esComercialCampo: true,
          esDelegadoGerencia: true,
          isOnline: true,
          lat: true,
          lng: true,
          lastLocationUpdate: true,
          role: { select: { id: true, name: true } },
          jornadas: {
            where: {
              estado: { in: ['Iniciada', 'En Pausa', 'En Ruta', 'Activa'] },
              horaInicio: { gte: startOfDay, lte: endOfDay }
            },
            take: 1,
            orderBy: { horaInicio: 'desc' },
            select: { id: true, estado: true, horaInicio: true, bateriaInicio: true }
          }
        },
        orderBy: { nombre: 'asc' }
      });

      const comercialesIds = comerciales.map(c => c.id);
      const ultimosPings = await prisma.rastreoUbicacion.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          timestamp: { gte: startOfDay }
        },
        orderBy: { timestamp: 'desc' }
      });
      const pingMap = new Map();
      ultimosPings.forEach(p => {
        const uId = String(p.usuarioId);
        if (!pingMap.has(uId)) pingMap.set(uId, p);
      });

      const mapped = comerciales.map(c => {
        const cKey = String(c.id);
        const pres = presenciaMap.get(cKey);
        const pingGps = pingMap.get(cKey);

        const tieneJornadaActivaHoy = Boolean(c.jornadas && c.jornadas.length > 0);
        const jActiva = tieneJornadaActivaHoy ? c.jornadas[0] : null;

        // Trazabilidad real de conexión desde la secuencia de login / auditoría
        const isOnlineReal = Boolean(pres?.isOnline || (pres?.estadoPresencia === 'EN_LINEA'));
        const primerIngreso = pres?.primerIngreso || (jActiva ? jActiva.horaInicio : null);
        const ultimoAccesoHoy = pres?.ultimoAccesoHoy || null;

        const updateTime = pingGps?.timestamp
          ? new Date(pingGps.timestamp).getTime()
          : (c.lastLocationUpdate ? Number(c.lastLocationUpdate) : null);
        const diffMs = updateTime ? (ahora.getTime() - updateTime) : Infinity;
        const pingReciente = diffMs < 15 * 60 * 1000;

        // Batería: SOLO valor real si fue reportado, NUNCA inventar 90 o 95
        const bateriaReal = (pingReciente && pingGps?.bateria != null)
          ? Number(pingGps.bateria)
          : (jActiva?.bateriaInicio != null ? Number(jActiva.bateriaInicio) : null);

        // En Vivo: Requiere reporte reciente de GPS Y estar en jornada activa hoy Y estar en línea
        const enVivo = Boolean(tieneJornadaActivaHoy && pingReciente && isOnlineReal);

        return {
          ...c,
          isOnline: isOnlineReal,
          primerIngreso,
          ultimoAccesoHoy,
          estadoPresencia: pres?.estadoPresencia || (isOnlineReal ? 'EN_LINEA' : 'DESCONECTADO'),
          jornadaActivaId: jActiva ? jActiva.id : null,
          horaInicioJornada: jActiva ? jActiva.horaInicio : null,
          estadoJornada: jActiva ? jActiva.estado : 'Sin Turno',
          bateria: bateriaReal,
          velocidad: pingReciente && pingGps?.velocidad != null ? Math.round(Number(pingGps.velocidad)) : 0,
          lat: pingReciente && pingGps?.lat ? Number(pingGps.lat) : (c.lat ? Number(c.lat) : null),
          lng: pingReciente && pingGps?.lng ? Number(pingGps.lng) : (c.lng ? Number(c.lng) : null),
          lastLocationUpdate: updateTime ? new Date(updateTime).toISOString() : null,
          enVivo
        };
      });

      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getAuditoriaCampo(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido a la auditoría del módulo.' });
      }

      const logs = await prisma.auditoria.findMany({
        where: { modulo: 'operaciones_campo' },
        include: {
          user: {
            select: { id: true, nombre: true, apellido: true, cargo: true, user: true, roleId: true }
          }
        },
        orderBy: { fecha: 'desc' },
        take: 200
      });

      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- SEGUIMIENTO COMERCIAL MANUAL ---
  async crearSeguimiento(req, res) {
    try {
      const {
        clienteId,
        clienteExternoId,
        prospectoId,
        visitaId,
        resultado,
        observaciones = '',
        compromisos = '',
        proximaActividad = null,
        fechaProgramada = null,
        tipo,
        descripcion,
        estado,
        esComercialExterno
      } = req.body;

      // Consolidar observaciones y resultado considerando los campos enviados desde la UI móvil y de campo
      const obsFinal = (observaciones || descripcion || compromisos || '').trim();
      const resFinal = (resultado || (tipo ? `${tipo}${estado ? ` (${estado})` : ''}` : '') || (estado ? `Estado: ${estado}` : 'Seguimiento registrado')).trim();

      if (!obsFinal && !compromisos && !resFinal) {
        return res.status(400).json({ error: 'Debe especificar al menos un resultado, observación o compromiso.' });
      }

      // Resolver si el identificador corresponde a un ClienteExternoCampo o a un Cliente interno del ERP
      let resolvedClienteId = null;
      let resolvedClienteExternoId = clienteExternoId || null;

      if (clienteId && !resolvedClienteExternoId) {
        const clienteExt = await prisma.clienteExternoCampo.findUnique({ where: { id: clienteId } });
        if (clienteExt) {
          resolvedClienteExternoId = clienteExt.id;
        } else {
          const clienteInt = await prisma.cliente.findUnique({ where: { id: clienteId } });
          if (clienteInt) {
            resolvedClienteId = clienteInt.id;
          } else {
            resolvedClienteExternoId = clienteId;
          }
        }
      }

      const nuevoSeguimiento = await prisma.seguimientoCampo.create({
        data: {
          usuarioId: req.user.id,
          clienteId: resolvedClienteId,
          clienteExternoId: resolvedClienteExternoId,
          prospectoId: prospectoId || null,
          visitaId: visitaId || null,
          tipoAccion: tipo || 'Seguimiento',
          resultado: resFinal,
          observaciones: obsFinal || 'Seguimiento comercial de campo',
          compromisos: compromisos || null,
          proximaActividad: proximaActividad || null,
          fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,
          evidencias: Array.isArray(req.body.evidencias || req.body.adjuntos) ? (req.body.evidencias || req.body.adjuntos) : []
        },
        include: {
          cliente: true,
          clienteExterno: true,
          prospecto: true,
          usuario: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      // Si se definió próxima fecha programada, crear la actividad de seguimiento
      if (fechaProgramada) {
        const count = await prisma.actividadCampo.count();
        let codigoAct = `ACT-${String(count + 1).padStart(5, '0')}`;
        const existsAct = await prisma.actividadCampo.findUnique({ where: { codigo: codigoAct } });
        if (existsAct) {
          codigoAct = `ACT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
        }
        await prisma.actividadCampo.create({
          data: {
            codigo: codigoAct,
            usuarioId: req.user.id,
            asignadoPorId: req.user.id,
            titulo: `Seguimiento: ${proximaActividad || 'Contacto Comercial'}`,
            descripcion: compromisos || observaciones,
            prioridad: 'Normal',
            fechaProgramada: new Date(fechaProgramada),
            estado: 'Pendiente'
          }
        });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_SEGUIMIENTO_CREADO', {
        seguimientoId: nuevoSeguimiento.id,
        clienteId
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_SEGUIMIENTO_UPDATE', { accion: 'CREAR', seguimiento: nuevoSeguimiento, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_SEGUIMIENTO_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, seguimiento: nuevoSeguimiento });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarSeguimiento(req, res) {
    try {
      const { id } = req.params;
      const seg = await prisma.seguimientoCampo.findUnique({ where: { id } });
      if (!seg) return res.status(404).json({ error: 'Seguimiento no encontrado.' });

      if (!this.esDelegado(req.user) && seg.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para modificar este seguimiento.' });
      }

      const {
        resultado,
        observaciones,
        compromisos,
        proximaActividad,
        fechaProgramada,
        tipo,
        tipoAccion,
        estado
      } = req.body;

      const dataUpdate = {};
      if (resultado !== undefined || estado !== undefined) {
        dataUpdate.resultado = resultado !== undefined
          ? String(resultado).trim()
          : `${seg.tipoAccion || 'Seguimiento'} (${estado})`;
      }
      if (observaciones !== undefined) dataUpdate.observaciones = String(observaciones).trim();
      if (compromisos !== undefined) dataUpdate.compromisos = compromisos ? String(compromisos).trim() : null;
      if (proximaActividad !== undefined) dataUpdate.proximaActividad = proximaActividad ? String(proximaActividad).trim() : null;
      if (fechaProgramada !== undefined) dataUpdate.fechaProgramada = fechaProgramada ? new Date(fechaProgramada) : null;
      if (tipo || tipoAccion) dataUpdate.tipoAccion = tipo || tipoAccion;

      const actualizado = await prisma.seguimientoCampo.update({
        where: { id },
        data: dataUpdate,
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
          cliente: { select: { id: true, nom: true, tel: true, direccion: true } },
          clienteExterno: { select: { id: true, nombre: true, nitDoc: true, telefono: true, direccion: true, ciudad: true, etapaEmbudo: true } },
          prospecto: { select: { id: true, nombreComercial: true, direccion: true } }
        }
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_SEGUIMIENTO_UPDATE', { accion: 'ACTUALIZAR', seguimiento: actualizado, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_SEGUIMIENTO_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, seguimiento: actualizado });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarSeguimiento(req, res) {
    try {
      const { id } = req.params;
      const seg = await prisma.seguimientoCampo.findUnique({ where: { id } });
      if (!seg) return res.status(404).json({ error: 'Seguimiento no encontrado.' });

      if (!this.esDelegado(req.user) && seg.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para eliminar este seguimiento.' });
      }

      await prisma.seguimientoCampo.delete({ where: { id } });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_SEGUIMIENTO_UPDATE', { accion: 'ELIMINAR', id, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_SEGUIMIENTO_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Seguimiento eliminado correctamente.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- GESTIÓN AVANZADA DE ACTIVIDADES Y TAREAS ---
  async modificarActividad(req, res) {
    try {
      const { id } = req.params;
      const { titulo, descripcion, prioridad, fechaProgramada, horaEstimada, usuarioId, estado } = req.body;

      const actExistente = await prisma.actividadCampo.findUnique({ where: { id } });
      if (!actExistente) {
        return res.status(404).json({ error: 'Actividad / Tarea no encontrada' });
      }

      const esAdminODelegado = this.esDelegado(req.user);
      if (!esAdminODelegado && actExistente.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No tiene permisos para modificar esta actividad.' });
      }

      const updateData = {};
      if (titulo !== undefined) updateData.titulo = titulo.trim();
      if (descripcion !== undefined) updateData.descripcion = descripcion.trim();
      if (prioridad !== undefined) updateData.prioridad = prioridad;
      if (fechaProgramada !== undefined) {
        updateData.fechaProgramada = String(fechaProgramada).includes('T')
          ? new Date(fechaProgramada)
          : new Date(`${String(fechaProgramada).split('T')[0]}T12:00:00.000Z`);
      }
      if (horaEstimada !== undefined) updateData.horaEstimada = horaEstimada;
      // Auditoría detallada de cambios
      const existingComments = Array.isArray(actExistente.comentarios) ? [...actExistente.comentarios] : [];
      const userNom = `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.user;

      if (usuarioId !== undefined && usuarioId !== actExistente.usuarioId && esAdminODelegado) {
        updateData.usuarioId = usuarioId;
        let oldResp = 'Anterior';
        let newResp = 'Nuevo';
        try {
          const uOld = await prisma.user.findUnique({ where: { id: actExistente.usuarioId }, select: { nombre: true, apellido: true } });
          if (uOld) oldResp = `${uOld.nombre} ${uOld.apellido || ''}`.trim();
          const uNew = await prisma.user.findUnique({ where: { id: usuarioId }, select: { nombre: true, apellido: true } });
          if (uNew) newResp = `${uNew.nombre} ${uNew.apellido || ''}`.trim();
        } catch (e) {}

        existingComments.push({
          fecha: new Date().toISOString(),
          usuarioId: req.user.id,
          usuario: userNom,
          accion: 'REASIGNACION',
          tipo: 'evento',
          responsableAnterior: oldResp,
          responsableActual: newResp,
          responsableActualId: usuarioId,
          texto: `Tarea reasignada de ${oldResp} a ${newResp} por el Delegado de Gerencia.`
        });

        // Notificar al nuevo asesor
        try {
          const notifId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
          await prisma.notificacion.create({
            data: {
              id: notifId,
              paraId: usuarioId,
              titulo: 'Tarea Reasignada por el Delegado',
              mensaje: `El Delegado de Gerencia ${userNom} le ha reasignado la tarea: "${actExistente.titulo}".`,
              de: userNom,
              tipo: 'actividad_reasignada',
              fecha: new Date(),
              leida: false,
              targetModule: 'comercial_campo'
            }
          });
        } catch (eNotif) {}
      }

      if (estado !== undefined && estado !== actExistente.estado) {
        updateData.estado = estado;
        if (estado === 'Finalizada' || estado === 'Completada' || estado === 'Aprobada') updateData.fechaFinalizacion = new Date();
        else updateData.fechaFinalizacion = null;

        existingComments.push({
          fecha: new Date().toISOString(),
          usuarioId: req.user.id,
          usuario: userNom,
          accion: 'CAMBIO_ESTADO',
          tipo: 'evento',
          estadoAnterior: actExistente.estado,
          estadoNuevo: estado,
          texto: `Estado modificado de "${actExistente.estado}" a "${estado}" por ${userNom}.`
        });
      }

      if (Object.keys(updateData).some(k => k === 'titulo' || k === 'descripcion' || k === 'prioridad' || k === 'fechaProgramada')) {
        existingComments.push({
          fecha: new Date().toISOString(),
          usuarioId: req.user.id,
          usuario: userNom,
          accion: 'MODIFICACION',
          tipo: 'evento',
          texto: `Parámetros actualizados por ${userNom}: ${Object.keys(updateData).filter(k => k !== 'comentarios').join(', ')}.`
        });
      }

      updateData.comentarios = existingComments;

      const actividadActualizada = await prisma.actividadCampo.update({
        where: { id },
        data: updateData,
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true } },
          asignadoPor: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      await this.registrarAuditoria(req.user.id, 'CAMPO_ACTIVIDAD_MODIFICADA', {
        actividadId: id,
        camposModificados: Object.keys(updateData)
      });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'MODIFICAR', actividad: actividadActualizada, tarea: actividadActualizada });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'MODIFICAR', tarea: actividadActualizada, actividad: actividadActualizada });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, actividad: actividadActualizada, tarea: actividadActualizada });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // Aprobar formalmente la gestión de una tarea o ruta
  async aprobarActividad(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede aprobar gestiones de campo.' });
      }
      const { id } = req.params;
      const { comentario, observacion } = req.body;
      const result = await actividadesService.actualizarEstado(req.user.id, id, {
        accion: 'APROBACION',
        estado: 'Aprobada',
        comentario: comentario || observacion || 'Gestión verificada y aprobada por el Delegado de Gerencia.'
      });
      if (!result.success) return res.status(400).json({ error: result.error });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'APROBAR', actividad: result.actividad, tarea: result.actividad });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'APROBAR', tarea: result.actividad });
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'APROBAR', ruta: result.actividad });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Gestión aprobada exitosamente.', actividad: result.actividad });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // Solicitar corrección / devolver tarea al asesor
  async solicitarCorreccionActividad(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede solicitar correcciones.' });
      }
      const { id } = req.params;
      const { instrucciones, observaciones, comentario } = req.body;
      const textoInstrucciones = instrucciones || observaciones || comentario;
      if (!textoInstrucciones || !textoInstrucciones.trim()) {
        return res.status(400).json({ error: 'Debe especificar las instrucciones o motivo de la corrección.' });
      }

      const result = await actividadesService.actualizarEstado(req.user.id, id, {
        accion: 'SOLICITUD_CORRECCION',
        estado: 'En Corrección',
        instrucciones: textoInstrucciones.trim(),
        comentario: textoInstrucciones.trim()
      });
      if (!result.success) return res.status(400).json({ error: result.error });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'SOLICITAR_CORRECCION', actividad: result.actividad, tarea: result.actividad });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'SOLICITAR_CORRECCION', tarea: result.actividad });
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'SOLICITAR_CORRECCION', ruta: result.actividad });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Solicitud de corrección enviada al asesor.', actividad: result.actividad });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // Reabrir tarea o ruta para seguimiento
  async reabrirActividad(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede reabrir actividades o rutas.' });
      }
      const { id } = req.params;
      const { motivo, nuevaFecha } = req.body;

      const result = await actividadesService.actualizarEstado(req.user.id, id, {
        accion: 'REAPERTURA',
        estado: 'En ejecucion',
        motivo: motivo || 'Reapertura para seguimiento gerencial.',
        nuevaFecha
      });
      if (!result.success) return res.status(400).json({ error: result.error });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'REABRIR', actividad: result.actividad, tarea: result.actividad });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'REABRIR', tarea: result.actividad });
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'REABRIR', ruta: result.actividad });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Actividad reabierta correctamente.', actividad: result.actividad });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarActividad(req, res) {
    try {
      const { id } = req.params;
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar actividades/tareas asignadas.' });
      }

      await prisma.actividadCampo.delete({ where: { id } });

      await this.registrarAuditoria(req.user.id, 'CAMPO_ACTIVIDAD_ELIMINADA', { actividadId: id });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'ELIMINAR', id });
        io.emit('CAMPO_TAREA_UPDATE', { accion: 'ELIMINAR', id });
        io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Tarea / Actividad eliminada correctamente.' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // Eliminar TODAS las Actividades / Tareas Asignadas
  async eliminarTodasActividades(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar todas las tareas asignadas.' });
      }

      const { usuarioId } = req.query;
      const where = {
        AND: [
          { NOT: { codigo: { startsWith: 'RUT-' } } },
          { NOT: { titulo: { contains: 'Ruta', mode: 'insensitive' } } }
        ]
      };

      if (usuarioId && usuarioId !== 'TODOS') {
        where.usuarioId = usuarioId;
      }

      const actividades = await prisma.actividadCampo.findMany({
        where,
        select: { id: true }
      });

      const ids = actividades.map(a => a.id);

      if (ids.length > 0) {
        await prisma.evidenciaCampo.deleteMany({
          where: { actividadId: { in: ids } }
        }).catch(() => {});

        const result = await prisma.actividadCampo.deleteMany({
          where: { id: { in: ids } }
        });

        await this.registrarAuditoria(req.user.id, 'CAMPO_TODAS_TAREAS_ELIMINADAS', {
          totalEliminadas: result.count,
          usuarioFiltro: usuarioId || 'TODOS'
        });

        const io = req.app ? req.app.get('io') : null;
        if (io) {
          io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'ELIMINAR_TODAS', ids });
          io.emit('CAMPO_TAREA_UPDATE', { accion: 'ELIMINAR_TODAS', ids });
          io.emit('db_update', { type: 'CAMPO_TAREA_UPDATE', timestamp: Date.now() });
        }

        return res.json({
          success: true,
          count: result.count,
          message: `Se eliminaron ${result.count} tareas asignadas correctamente.`
        });
      }

      res.json({
        success: true,
        count: 0,
        message: 'No hay tareas asignadas para eliminar.'
      });
    } catch (err) {
      console.error('Error eliminando todas las tareas de campo:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // --- ASIGNACIÓN DE RUTAS ---
  async asignarRuta(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido: Solo el Delegado de Gerencia puede asignar rutas.' });
      }

      const {
        nombreRuta,
        zonaId,
        zona,
        usuarioId: reqUsuarioId,
        comercialId,
        asignadoAId,
        fecha: reqFecha,
        fechaRuta,
        prioridad = 'Alta',
        clientesIds = [],
        puntosParada = '',
        notas = '',
        instrucciones = ''
      } = req.body;

      const usuarioId = reqUsuarioId || comercialId || asignadoAId;
      const fechaFinal = reqFecha || fechaRuta;

      if (!usuarioId) return res.status(400).json({ error: 'Debe seleccionar un comercial responsable para la ruta.' });
      if (!fechaFinal) return res.status(400).json({ error: 'Debe especificar la fecha de la ruta.' });

      const fechaObj = String(fechaFinal).includes('T')
        ? new Date(fechaFinal)
        : new Date(`${String(fechaFinal).split('T')[0]}T12:00:00.000Z`);
      const countAct = await prisma.actividadCampo.count();
      let codigoRuta = `RUT-${String(countAct + 1).padStart(5, '0')}`;
      const existsRuta = await prisma.actividadCampo.findUnique({ where: { codigo: codigoRuta } });
      if (existsRuta) {
        codigoRuta = `RUT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
      }

      const detalleTexto = instrucciones || notas || (puntosParada ? `Paradas: ${puntosParada}` : '') || `Ruta asignada en zona ${zona || 'Comercial'}.`;
      const paradasCount = Array.isArray(clientesIds) && clientesIds.length > 0 ? clientesIds.length : (puntosParada ? puntosParada.split(',').length : 1);

      // 1. Crear actividad matriz de la ruta
      const actividadRuta = await prisma.actividadCampo.create({
        data: {
          codigo: codigoRuta,
          usuarioId,
          asignadoPorId: req.user.id,
          titulo: `Ruta: ${nombreRuta || (zona ? `Zona ${zona}` : 'Ruta Comercial')}`,
          descripcion: `Instrucciones del Delegado: ${detalleTexto}\nParadas asignadas: ${paradasCount}.`,
          prioridad,
          fechaProgramada: fechaObj,
          estado: 'Pendiente',
          evidencias: Array.isArray(req.body.evidencias || req.body.adjuntos) ? (req.body.evidencias || req.body.adjuntos) : [],
          comentarios: [
            {
              fecha: new Date(),
              usuario: (`${req.user?.nombre || ''} ${req.user?.apellido || ''}`.trim()) || req.user?.username || req.user?.email || 'Delegado de Gerencia',
              texto: `Ruta programada por el Delegado de Gerencia.`
            }
          ]
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
          asignadoPor: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      // 2. Programar las paradas asociadas a la ruta en VisitaCampo (conectadas con la Ruta Día a Día)
      const visitasCreadas = [];
      if (Array.isArray(clientesIds) && clientesIds.length > 0) {
        for (let i = 0; i < clientesIds.length; i++) {
          const rawClienteId = clientesIds[i];
          const clienteExt = await prisma.clienteExternoCampo.findUnique({ where: { id: rawClienteId } }).catch(() => null);
          const clienteInt = !clienteExt ? await prisma.cliente.findUnique({ where: { id: rawClienteId } }).catch(() => null) : null;
          const nombreParada = clienteExt?.nombre || clienteInt?.nom || `Parada #${i + 1}`;
          const dirParada = clienteExt?.direccion || clienteInt?.dir || '';

          const countVis = await prisma.visitaCampo.count();
          const codigoVis = `VIS-${Date.now().toString().slice(-5)}-${String(countVis + i + 1).padStart(3, '0')}`;

          const horaEstimadaMin = 8 * 60 + i * 60;
          const h = Math.floor(horaEstimadaMin / 60);
          const m = horaEstimadaMin % 60;
          const horaEstimadaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

          const vis = await prisma.visitaCampo.create({
            data: {
              codigo: codigoVis,
              usuarioId,
              clienteId: clienteInt ? clienteInt.id : null,
              clienteExternoId: clienteExt ? clienteExt.id : null,
              tipoVisita: 'Ruta Asignada',
              estado: 'Programada',
              fechaProgramada: fechaObj,
              horaEstimada: horaEstimadaStr,
              resultadoResumen: nombreParada,
              contactoAtendio: clienteExt?.contacto || null,
              observaciones: `[Ruta ${codigoRuta}] Parada #${i + 1}: ${nombreParada}${dirParada ? ` (${dirParada})` : ''}. ${detalleTexto}`,
              compromisos: `Parada #${i + 1} de la ruta: ${nombreRuta || 'Asignada'}.`
            }
          });
          visitasCreadas.push(vis);
        }
      } else if (puntosParada && String(puntosParada).trim()) {
        const listaParadas = String(puntosParada).split(',').map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < listaParadas.length; i++) {
          const nombreParada = listaParadas[i];
          const countVis = await prisma.visitaCampo.count();
          const codigoVis = `VIS-${Date.now().toString().slice(-5)}-${String(countVis + i + 1).padStart(3, '0')}`;

          const horaEstimadaMin = 8 * 60 + i * 60;
          const h = Math.floor(horaEstimadaMin / 60);
          const m = horaEstimadaMin % 60;
          const horaEstimadaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

          const vis = await prisma.visitaCampo.create({
            data: {
              codigo: codigoVis,
              usuarioId,
              tipoVisita: 'Ruta Asignada',
              estado: 'Programada',
              fechaProgramada: fechaObj,
              horaEstimada: horaEstimadaStr,
              resultadoResumen: nombreParada,
              observaciones: `[Ruta ${codigoRuta}] Parada #${i + 1}: ${nombreParada}. ${detalleTexto}`,
              compromisos: `Parada #${i + 1} de la ruta: ${nombreRuta || 'Asignada'}.`
            }
          });
          visitasCreadas.push(vis);
        }
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_RUTA_ASIGNADA', {
        actividadRutaId: actividadRuta.id,
        usuarioAsignadoId: usuarioId,
        totalClientes: clientesIds.length,
        fecha: fechaFinal
      });

      // Notificar inmediatamente al Comercial en Campo sobre la ruta asignada
      try {
        const notifId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        const fechaTexto = fechaFinal ? String(fechaFinal).split('T')[0] : 'próximamente';
        const nuevaNotif = await prisma.notificacion.create({
          data: {
            id: notifId,
            paraId: usuarioId,
            titulo: 'Nueva Ruta Comercial Asignada',
            mensaje: `El Delegado de Gerencia ${req.user.nombre || req.user.user} le ha asignado la ruta: "${nombreRuta || 'Ruta de Terreno'}" programada para el ${fechaTexto}. Zona: ${zona || 'Comercial'}.`,
            de: `${req.user.nombre || req.user.user}`,
            tipo: 'ruta_asignada',
            fecha: new Date(),
            leida: false,
            targetModule: 'comercial_campo'
          }
        });
        if (req.app && req.app.get('io')) {
          req.app.get('io').emit('notificacion:nueva', nuevaNotif);
        }
      } catch (errNotif) {
        console.error('Error generando notificación de ruta para comercial:', errNotif);
      }

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'CREAR', ruta: actividadRuta });
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'CREAR', actividad: actividadRuta, tarea: actividadRuta });
        io.emit('db_update', { type: 'CAMPO_RUTA_UPDATE', timestamp: Date.now() });
      }

      res.status(201).json({
        success: true,
        ruta: actividadRuta,
        actividadRuta,
        totalVisitas: visitasCreadas.length
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getRutasAsignadas(req, res) {
    try {
      const { usuarioId, fecha } = req.query;
      const where = {
        OR: [
          { codigo: { startsWith: 'RUT-' } },
          { titulo: { contains: 'Ruta', mode: 'insensitive' } }
        ]
      };

      if (this.esDelegado(req.user)) {
        if (usuarioId) where.usuarioId = usuarioId;
      } else {
        where.usuarioId = req.user.id;
      }

      if (fecha) {
        const start = new Date(fecha);
        start.setHours(0, 0, 0, 0);
        const end = new Date(fecha);
        end.setHours(23, 59, 59, 999);
        where.fechaProgramada = { gte: start, lte: end };
      }

      const rutas = await prisma.actividadCampo.findMany({
        where,
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
          asignadoPor: { select: { id: true, nombre: true, apellido: true } }
        },
        orderBy: { fechaProgramada: 'desc' }
      });

      // Enriquecer cada ruta con el progreso real de sus paradas en VisitaCampo (Ruta Día a Día)
      const rutasEnriquecidas = await Promise.all(rutas.map(async (r) => {
        const fechaR = r.fechaProgramada ? new Date(r.fechaProgramada) : null;
        let paradasRuta = [];
        if (r.codigo) {
          paradasRuta = await prisma.visitaCampo.findMany({
            where: {
              usuarioId: r.usuarioId,
              observaciones: { contains: `[Ruta ${r.codigo}]` }
            },
            orderBy: { createdAt: 'asc' }
          }).catch(() => []);
        }
        if (paradasRuta.length === 0 && fechaR) {
          const sDay = new Date(fechaR);
          sDay.setHours(0, 0, 0, 0);
          const eDay = new Date(fechaR);
          eDay.setHours(23, 59, 59, 999);
          paradasRuta = await prisma.visitaCampo.findMany({
            where: {
              usuarioId: r.usuarioId,
              OR: [
                { checkInHora: { gte: sDay, lte: eDay } },
                { fechaProgramada: { gte: sDay, lte: eDay } }
              ]
            },
            orderBy: { createdAt: 'asc' }
          }).catch(() => []);
        }
        const totalParadasRuta = paradasRuta.length;
        const paradasCompletadasRuta = paradasRuta.filter(p => p.estado === 'Realizada' || p.checkOutHora != null).length;
        const paradasEnCursoRuta = paradasRuta.filter(p => p.estado === 'En Curso' || (p.checkInHora != null && p.checkOutHora == null)).length;
        const progresoRutaPct = totalParadasRuta > 0 ? Math.round((paradasCompletadasRuta / totalParadasRuta) * 100) : (['Completada', 'Finalizada', 'Aprobada'].includes(r.estado) ? 100 : 0);

        return {
          ...r,
          totalParadasRuta,
          paradasCompletadasRuta,
          paradasEnCursoRuta,
          progresoRutaPct,
          paradasDetalle: paradasRuta.map((p, idx) => ({
            id: p.id,
            codigo: p.codigo,
            orden: idx + 1,
            lugar: p.resultadoResumen || 'Parada programada',
            estado: p.checkOutHora ? 'Realizada' : (p.checkInHora ? 'En Curso' : p.estado),
            horaLlegada: p.checkInHora ? formatHoraColombia(p.checkInHora) : null,
            horaSalida: p.checkOutHora ? formatHoraColombia(p.checkOutHora) : null,
            duracionMin: p.duracionMin || 0
          }))
        };
      }));

      res.json(rutasEnriquecidas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // Actualizar / Editar una Ruta Asignada
  async actualizarRuta(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'No autorizado para modificar rutas asignadas.' });
      }

      const { id } = req.params;
      const {
        titulo,
        nombreRuta,
        descripcion,
        notas,
        instrucciones,
        puntosParada,
        zona,
        comercialId,
        usuarioId,
        fechaRuta,
        fechaProgramada,
        prioridad,
        estado,
        evidencias,
        adjuntos
      } = req.body;

      const rutaExistente = await prisma.actividadCampo.findUnique({
        where: { id }
      });

      if (!rutaExistente) {
        return res.status(404).json({ error: 'Ruta asignada no encontrada.' });
      }

      const updateData = {};

      if (titulo || nombreRuta) {
        const t = (titulo || nombreRuta).trim();
        updateData.titulo = t.startsWith('Ruta:') ? t : `Ruta: ${t}`;
      }

      if (descripcion !== undefined || notas !== undefined || instrucciones !== undefined || puntosParada !== undefined) {
        if (descripcion !== undefined && !notas && !puntosParada) {
          updateData.descripcion = descripcion.trim();
        } else {
          const detalle = (instrucciones || notas || (puntosParada ? `Paradas: ${puntosParada}` : '') || `Ruta asignada en zona ${zona || 'Comercial'}.`).trim();
          const paradas = puntosParada || '1';
          updateData.descripcion = `Instrucciones del Delegado: ${detalle}\nParadas asignadas: ${paradas}.`;
        }
      }

      const nuevoUsuarioId = usuarioId || comercialId;
      if (nuevoUsuarioId) {
        updateData.usuarioId = nuevoUsuarioId;
      }

      const nuevaFecha = fechaProgramada || fechaRuta;
      if (nuevaFecha) {
        updateData.fechaProgramada = String(nuevaFecha).includes('T')
          ? new Date(nuevaFecha)
          : new Date(`${String(nuevaFecha).split('T')[0]}T12:00:00.000Z`);
      }

      if (prioridad) updateData.prioridad = prioridad;
      if (estado) {
        updateData.estado = estado;
        if (estado === 'Finalizada' || estado === 'Completada') {
          updateData.fechaFinalizacion = new Date();
        }
      }

      const files = evidencias || adjuntos;
      if (Array.isArray(files)) {
        updateData.evidencias = files;
      }

      const rutaActualizada = await prisma.actividadCampo.update({
        where: { id },
        data: updateData,
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
          asignadoPor: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      await this.registrarAuditoria(req.user.id, 'CAMPO_RUTA_ACTUALIZADA', {
        id,
        codigo: rutaActualizada.codigo,
        titulo: rutaActualizada.titulo,
        cambios: updateData
      });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'MODIFICAR', ruta: rutaActualizada });
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'MODIFICAR', actividad: rutaActualizada, tarea: rutaActualizada });
        io.emit('db_update', { type: 'CAMPO_RUTA_UPDATE', timestamp: Date.now() });
      }

      res.json({
        success: true,
        message: 'Ruta actualizada correctamente.',
        ruta: rutaActualizada
      });
    } catch (err) {
      console.error('Error actualizando ruta de campo:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Eliminar una Ruta Asignada específica
  async eliminarRuta(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'No autorizado para eliminar rutas asignadas.' });
      }

      const { id } = req.params;

      const rutaExistente = await prisma.actividadCampo.findUnique({
        where: { id }
      });

      if (!rutaExistente) {
        return res.status(404).json({ error: 'Ruta asignada no encontrada.' });
      }

      // Eliminar evidencias hijas asociadas si las hay
      await prisma.evidenciaCampo.deleteMany({
        where: { actividadId: id }
      }).catch(() => {});

      await prisma.actividadCampo.delete({
        where: { id }
      });

      await this.registrarAuditoria(req.user.id, 'CAMPO_RUTA_ELIMINADA', {
        id,
        codigo: rutaExistente.codigo,
        titulo: rutaExistente.titulo
      });

      const io = req.app ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_RUTA_UPDATE', { accion: 'ELIMINAR', id });
        io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'ELIMINAR', id });
        io.emit('db_update', { type: 'CAMPO_RUTA_UPDATE', timestamp: Date.now() });
      }

      res.json({
        success: true,
        message: 'Ruta eliminada correctamente.',
        id
      });
    } catch (err) {
      console.error('Error eliminando ruta de campo:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Eliminar TODAS las Rutas Asignadas
  async eliminarTodasRutas(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'No autorizado para eliminar todas las rutas asignadas.' });
      }

      const { usuarioId } = req.query;
      const where = {
        OR: [
          { codigo: { startsWith: 'RUT-' } },
          { titulo: { contains: 'Ruta', mode: 'insensitive' } }
        ]
      };

      if (usuarioId) {
        where.usuarioId = usuarioId;
      }

      const rutas = await prisma.actividadCampo.findMany({
        where,
        select: { id: true }
      });

      const ids = rutas.map(r => r.id);

      if (ids.length > 0) {
        await prisma.evidenciaCampo.deleteMany({
          where: { actividadId: { in: ids } }
        }).catch(() => {});

        const result = await prisma.actividadCampo.deleteMany({
          where: { id: { in: ids } }
        });

        await this.registrarAuditoria(req.user.id, 'CAMPO_TODAS_RUTAS_ELIMINADAS', {
          totalEliminadas: result.count,
          usuarioFiltro: usuarioId || 'TODOS'
        });

        const io = req.app ? req.app.get('io') : null;
        if (io) {
          io.emit('CAMPO_RUTA_UPDATE', { accion: 'ELIMINAR_TODAS', ids });
          io.emit('CAMPO_ACTIVIDAD_UPDATE', { accion: 'ELIMINAR_TODAS', ids });
          io.emit('db_update', { type: 'CAMPO_RUTA_UPDATE', timestamp: Date.now() });
        }

        return res.json({
          success: true,
          count: result.count,
          message: `Se eliminaron ${result.count} rutas asignadas correctamente.`
        });
      }

      res.json({
        success: true,
        count: 0,
        message: 'No hay rutas asignadas para eliminar.'
      });
    } catch (err) {
      console.error('Error eliminando todas las rutas de campo:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // --- TRAZABILIDAD COMPLETA DE CALLE POR FECHA ---
  async getHistorialDiaCompleto(req, res) {
    try {
      const { usuarioId, fecha } = req.query;
      const targetUserId = this.esDelegado(req.user) ? (usuarioId || req.user.id) : req.user.id;
      const fechaConsulta = fecha || getFechaColombia(new Date());

      const startOfDay = new Date(`${fechaConsulta}T00:00:00-05:00`);
      const endOfDay = new Date(`${fechaConsulta}T23:59:59.999-05:00`);

      // 1. Jornada laboral de ese día
      const jornada = await prisma.jornadaLaboral.findFirst({
        where: {
          usuarioId: targetUserId,
          fecha: { gte: startOfDay, lte: endOfDay }
        },
        include: {
          pausas: true
        },
        orderBy: { horaInicio: 'asc' }
      });

      // 2. Visitas comerciales programadas / ejecutadas de ese día
      const visitas = await prisma.visitaCampo.findMany({
        where: {
          usuarioId: targetUserId,
          fechaProgramada: { gte: startOfDay, lte: endOfDay }
        },
        include: {
          cliente: true,
          clienteExterno: true,
          prospecto: true,
          seguimientos: true
        },
        orderBy: { checkInHora: 'asc' }
      });

      // 3. Recorrido GPS y paradas
      const trackingData = await trackingService.getHistorialRecorrido(targetUserId, fechaConsulta);

      // 4. Actividades del día
      const actividades = await prisma.actividadCampo.findMany({
        where: {
          usuarioId: targetUserId,
          fechaProgramada: { gte: startOfDay, lte: endOfDay }
        },
        include: {
          asignadoPor: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      // 5. Construir Timeline cronológico integrado
      const timeline = [];
      if (jornada) {
        timeline.push({
          tipo: 'JORNADA_INICIO',
          hora: jornada.horaInicio,
          titulo: 'Inicio de Jornada Laboral',
          descripcion: jornada.direccionInicio || 'Punto de partida',
          lat: jornada.latInicio,
          lng: jornada.lngInicio,
          dispositivo: jornada.dispositivo
        });

        (jornada.pausas || []).forEach(p => {
          timeline.push({
            tipo: 'PAUSA_INICIO',
            hora: p.horaInicio,
            titulo: `Inicio de ${p.tipo || 'Pausa'}`,
            descripcion: p.motivo || '',
            lat: p.lat,
            lng: p.lng
          });
          if (p.horaFin) {
            timeline.push({
              tipo: 'PAUSA_FIN',
              hora: p.horaFin,
              titulo: `Fin de ${p.tipo || 'Pausa'}`,
              descripcion: `Duración: ${p.duracionMin || 0} min`,
              lat: p.lat,
              lng: p.lng
            });
          }
        });
      }

      visitas.forEach(v => {
        const clienteNom = v.resultadoResumen || v.clienteExterno?.nombre || v.cliente?.nom || v.prospecto?.nombreComercial || 'Lugar de Visita';
        if (v.checkInHora) {
          timeline.push({
            tipo: 'VISITA_LLEGADA',
            hora: v.checkInHora,
            titulo: `Llegada a Visita: ${clienteNom}`,
            descripcion: `Check-in geoverificado (${v.tipoVisita})`,
            lat: v.checkInLat,
            lng: v.checkInLng,
            visitaId: v.id,
            clienteNom
          });
        }
        if (v.checkOutHora) {
          timeline.push({
            tipo: 'VISITA_SALIDA',
            hora: v.checkOutHora,
            titulo: `Salida de Visita: ${clienteNom}`,
            descripcion: `Resultado: ${v.resultadoVisita || 'Realizada'} - Estancia: ${v.duracionMin} min`,
            lat: v.checkOutLat,
            lng: v.checkOutLng,
            resultado: v.resultadoVisita,
            duracionMin: v.duracionMin,
            observaciones: v.observaciones,
            firmaCliente: v.firmaCliente,
            evidencias: v.evidencias
          });
        }
      });

      if (jornada && jornada.horaFin) {
        timeline.push({
          tipo: 'JORNADA_FIN',
          hora: jornada.horaFin,
          titulo: 'Cierre de Jornada Laboral',
          descripcion: `Tiempo trabajado: ${Math.round(jornada.tiempoTotalMin / 60)}h ${jornada.tiempoTotalMin % 60}m. Distancia: ${jornada.distanciaKm} km`,
          lat: jornada.latFin,
          lng: jornada.lngFin
        });
      }

      // Ordenar cronológicamente
      timeline.sort((a, b) => new Date(a.hora) - new Date(b.hora));

      res.json({
        success: true,
        fecha: fechaConsulta,
        usuarioId: targetUserId,
        jornada,
        visitas,
        recorrido: trackingData,
        timeline,
        actividades
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- PANEL OPERATIVO EN VIVO PARA EL DELEGADO DE GERENCIA ---
  async getPanelOperativo(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido al Delegado de Gerencia.' });
      }

      await autoCerrarJornadasVencidas(prisma);

      const ahora = new Date();
      const { startOfDay, endOfDay } = getColombiaDayBounds(ahora);

      // Consulta de presencia real conectada a la secuencia de inicio de sesión y telemetría
      let dataPresencia = null;
      try {
        dataPresencia = await auditoriaService.obtenerSesionesActivas(ahora);
      } catch (ePres) {
        console.warn('[getPanelOperativo] Error consultando auditoriaService:', ePres?.message);
      }
      const presenciaMap = new Map();
      (dataPresencia?.usuarios || []).forEach(p => {
        presenciaMap.set(String(p.id), p);
      });

      // 1. Obtener únicamente los operadores en campo (nunca Delegados de Gerencia ni Administradores)
      const comerciales = await prisma.user.findMany({
        where: this.getFiltroOperadoresCampo(),
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          user: true,
          telefono: true,
          correo: true,
          foto: true,
          isOnline: true,
          lat: true,
          lng: true,
          lastLocationUpdate: true,
          roleId: true,
          esComercialCampo: true,
          esDelegadoGerencia: true,
          role: { select: { id: true, name: true } }
        },
        orderBy: { nombre: 'asc' }
      });

      const comercialesIds = comerciales.map(c => c.id);

      // Delegado de Gerencia supervisor activo
      let delegadoSupervisor = await prisma.user.findFirst({
        where: { esDelegadoGerencia: true },
        select: { nombre: true, apellido: true, cargo: true }
      });
      if (!delegadoSupervisor) {
        delegadoSupervisor = await prisma.user.findFirst({
          where: {
            OR: [
              { roleId: '1' },
              { role: { name: { contains: 'director comercial', mode: 'insensitive' } } },
              { role: { name: { contains: 'dirección comercial', mode: 'insensitive' } } }
            ]
          },
          select: { nombre: true, apellido: true, cargo: true }
        });
      }
      const delegadoResponsableTexto = delegadoSupervisor
        ? `${delegadoSupervisor.nombre} ${delegadoSupervisor.apellido || ''}`.trim() + (delegadoSupervisor.cargo ? ` (${delegadoSupervisor.cargo})` : ' (Delegado de Gerencia)')
        : 'Delegación General de Gerencia';

      // 2. Todas las jornadas de HOY (estrictamente dentro de la fecha de hoy)
      const todasJornadasHoy = await prisma.jornadaLaboral.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          horaInicio: { gte: startOfDay, lte: endOfDay }
        },
        orderBy: { id: 'desc' }
      });

      const jornadasActivasPorUsuario = new Map();
      const ultimaJornadaPorUsuario = new Map();
      todasJornadasHoy.forEach(j => {
        const uId = String(j.usuarioId);
        if (!ultimaJornadaPorUsuario.has(uId)) {
          ultimaJornadaPorUsuario.set(uId, j);
        }
        if (['Iniciada', 'En Pausa', 'En Ruta', 'Activa'].includes(j.estado) && !jornadasActivasPorUsuario.has(uId)) {
          jornadasActivasPorUsuario.set(uId, j);
        }
      });

      // 3. Visitas del día
      const visitasHoy = await prisma.visitaCampo.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          OR: [
            { fechaProgramada: { gte: startOfDay, lte: endOfDay } },
            { checkInHora: { gte: startOfDay, lte: endOfDay } },
            { createdAt: { gte: startOfDay, lte: endOfDay } }
          ]
        },
        include: { cliente: true, prospecto: true, clienteExterno: true }
      });

      const visitasEnCursoPorUsuario = new Map();
      visitasHoy.filter(v => v.estado === 'En Curso').forEach(v => {
        visitasEnCursoPorUsuario.set(String(v.usuarioId), v);
      });

      // 4. Últimos pings GPS registrados hoy
      const ultimosPingsHoy = await prisma.rastreoUbicacion.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          timestamp: { gte: startOfDay }
        },
        orderBy: { timestamp: 'desc' }
      });
      const pingPorUsuario = new Map();
      ultimosPingsHoy.forEach(p => {
        const uId = String(p.usuarioId);
        if (!pingPorUsuario.has(uId)) {
          pingPorUsuario.set(uId, p);
        }
      });

      // Helper formateador de hora
      const formatHora = (dateVal) => {
        if (!dateVal) return '--';
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
      };

      // 5. Clasificar comerciales con información integral para "PERSONAL DE CAMPO"
      let conectadosCount = 0;
      let enVisitaCount = 0;
      let disponiblesCount = 0;

      const comercialesDetalle = comerciales.map(c => {
        const cKey = String(c.id);
        const pres = presenciaMap.get(cKey) || presenciaMap.get(String(c.id));
        const jActiva = jornadasActivasPorUsuario.get(cKey) || jornadasActivasPorUsuario.get(c.id);
        const jUltima = ultimaJornadaPorUsuario.get(cKey) || ultimaJornadaPorUsuario.get(c.id);
        const vEnCurso = visitasEnCursoPorUsuario.get(cKey) || visitasEnCursoPorUsuario.get(c.id);
        const pingGps = pingPorUsuario.get(cKey) || pingPorUsuario.get(c.id);

        const isOnlineReal = Boolean(pres?.isOnline || (pres?.estadoPresencia === 'EN_LINEA'));
        const primerIngreso = pres?.primerIngreso || (jActiva ? jActiva.horaInicio : null);
        const ultimoAccesoHoy = pres?.ultimoAccesoHoy || null;

        const updateTime = pingGps?.timestamp
          ? new Date(pingGps.timestamp).getTime()
          : (c.lastLocationUpdate ? Number(c.lastLocationUpdate) : null);
        const pingReciente = updateTime ? (ahora.getTime() - updateTime < 15 * 60 * 1000) : false;

        let estadoOperativo = 'desconectado';
        let estado = 'Fuera de Turno';
        let disponible = false;
        let detalleVisita = null;

        if (jActiva) {
          conectadosCount++;
          if (vEnCurso) {
            estadoOperativo = 'en_visita';
            estado = 'Visitando cliente';
            enVisitaCount++;
            const minutosEnVisita = vEnCurso.checkInHora
              ? Math.max(1, Math.round((ahora - new Date(vEnCurso.checkInHora)) / 60000))
              : 0;
            const nombreCliente = vEnCurso.clienteExterno?.nombre || vEnCurso.cliente?.nom || vEnCurso.prospecto?.nombreComercial || 'Cliente';
            detalleVisita = {
              visitaId: vEnCurso.id,
              clienteNombre: nombreCliente,
              minutosEnVisita,
              tipoVisita: vEnCurso.tipoVisita
            };
          } else if (jActiva.estado === 'En Pausa') {
            estadoOperativo = 'en_pausa';
            estado = 'En Pausa';
          } else {
            estadoOperativo = 'en_jornada';
            estado = pingReciente ? 'En Ruta' : 'En Ruta (Sin Señal)';
            disponible = true;
            disponiblesCount++;
          }
        } else if (jUltima?.estado === 'Finalizada') {
          estadoOperativo = 'finalizada';
          estado = 'Jornada finalizada';
        } else if (isOnlineReal) {
          estadoOperativo = 'en_espera';
          estado = 'En Línea (Sin Turno)';
          disponible = false;
        }

        // Ubicación
        let latVal = (pingReciente && pingGps?.lat) ? pingGps.lat : (c.lat || null);
        let lngVal = (pingReciente && pingGps?.lng) ? pingGps.lng : (c.lng || null);
        let ultimaUbicacion = 'Sin reporte GPS';
        if (latVal && lngVal && (jActiva || pingReciente)) {
          const horaGps = updateTime ? ` (${formatHora(updateTime)})` : '';
          ultimaUbicacion = `Lat: ${Number(latVal).toFixed(4)}, Lng: ${Number(lngVal).toFixed(4)}${horaGps}`;
        }

        // Jornada horas
        const jornadaIniciada = jUltima?.horaInicio ? formatHora(jUltima.horaInicio) : '--';
        const jornadaFinalizada = jUltima?.horaFin ? formatHora(jUltima.horaFin) : (jActiva ? 'En curso' : '--');
        const visitandoCliente = vEnCurso
          ? (vEnCurso.clienteExterno?.nombre || vEnCurso.cliente?.nom || vEnCurso.prospecto?.nombreComercial || 'Cliente en Visita')
          : 'Ninguno';

        // Batería real (0 simulación)
        const bateriaVal = (pingReciente && pingGps?.bateria != null)
          ? Number(pingGps.bateria)
          : (jActiva?.bateriaInicio != null ? Number(jActiva.bateriaInicio) : null);
        const velocidadVal = (pingReciente && pingGps?.velocidad != null)
          ? Math.round(Number(pingGps.velocidad))
          : 0;

        return {
          ...c,
          nombreCompleto: `${c.nombre} ${c.apellido || ''}`.trim(),
          perfil: c.role?.name || c.cargo || 'Comercial en Campo',
          cargo: c.cargo || 'Asesor Comercial',
          isOnline: isOnlineReal,
          primerIngreso,
          ultimoAccesoHoy,
          estadoPresencia: pres?.estadoPresencia || (isOnlineReal ? 'EN_LINEA' : 'DESCONECTADO'),
          estado,
          estadoOperativo,
          disponible,
          bateria: bateriaVal,
          velocidad: velocidadVal,
          jornadaIniciada,
          jornadaFinalizada,
          ultimaUbicacion,
          visitandoCliente,
          delegadoResponsable: delegadoResponsableTexto,
          jornadaActivaId: jActiva?.id || null,
          horaInicioJornada: jActiva?.horaInicio || null,
          latActual: latVal || null,
          lngActual: lngVal || null,
          enVivo: Boolean(jActiva && pingReciente && isOnlineReal),
          detalleVisita
        };
      });

      // 5. Métricas de visitas de hoy
      const totalVisitasHoy = visitasHoy.length;
      const realizadasHoy = visitasHoy.filter(v => v.estado === 'Realizada').length;
      const noEfectivasHoy = visitasHoy.filter(v => v.estado === 'No Efectiva').length;
      const programadasHoy = visitasHoy.filter(v => v.estado === 'Programada').length;

      // 6. Ventas y cotizaciones de hoy originadas en visitas
      let ventasMontoHoy = 0;
      let ventasCantidadHoy = 0;
      visitasHoy.forEach(v => {
        if (v.resultadoVisita === 'Venta realizada') ventasCantidadHoy++;
      });

      // 7. Seguimientos pendientes hoy
      const seguimientosPendientes = await prisma.seguimientoCampo.count({
        where: {
          usuarioId: { in: comercialesIds },
          fechaProgramada: { gte: startOfDay, lte: endOfDay }
        }
      });

      // 8. Rutas activas hoy
      const rutasActivas = await prisma.actividadCampo.count({
        where: {
          titulo: { startsWith: 'Ruta:' },
          fechaProgramada: { gte: startOfDay, lte: endOfDay },
          estado: { notIn: ['Finalizada', 'Completada', 'Cancelada'] }
        }
      });

      // 9. Actividades / Tareas asignadas hoy
      const actividadesHoy = await prisma.actividadCampo.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          fechaProgramada: { gte: startOfDay, lte: endOfDay }
        }
      });
      const actAsignadasCount = actividadesHoy.length;
      const actCumplidasCount = actividadesHoy.filter(a => a.estado === 'Finalizada' || a.estado === 'Completada').length;
      const pctCumplimiento = actAsignadasCount > 0
        ? Math.round((actCumplidasCount / actAsignadasCount) * 100)
        : (totalVisitasHoy > 0 ? Math.round((realizadasHoy / totalVisitasHoy) * 100) : 0);

      res.json({
        success: true,
        fecha: ahora.toISOString().split('T')[0],
        metricas: {
          comercialesTotal: comerciales.length,
          conectados: conectadosCount,
          enVisita: enVisitaCount,
          disponibles: disponiblesCount,
          totalVisitasHoy,
          visitasRealizadas: realizadasHoy,
          visitasEnCurso: enVisitaCount,
          visitasProgramadas: programadasHoy,
          visitasNoEfectivas: noEfectivasHoy,
          ventasCantidadHoy,
          ventasMontoHoy,
          seguimientosPendientes,
          rutasActivas,
          actividadesAsignadas: actAsignadasCount,
          actividadesCumplidas: actCumplidasCount,
          tareasAsignadas: actAsignadasCount,
          tareasCumplidas: actCumplidasCount,
          pctCumplimiento
        },
        comerciales: comercialesDetalle,
        personalCampo: comercialesDetalle
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // =================================================================
  // --- OPERACIÓN COMERCIAL EXTERNA INDEPENDIENTE ---
  // =================================================================

  // --- CLASIFICACIONES CONFIGURABLES DE CLIENTES ---
  async getClasificaciones(req, res) {
    try {
      const data = await operacionExternaService.getClasificaciones(req.query.incluirInactivos === 'true');
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async crearClasificacion(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Operación restringida al Administrador o Delegado de Gerencia.' });
      }
      const data = await operacionExternaService.crearClasificacion(req.body);
      await this.registrarAuditoria(req.user.id, 'CREAR_CLASIFICACION_CLIENTE', { id: data.id, nombre: data.nombre }, null, req);
      res.status(201).json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarClasificacion(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Operación restringida al Administrador o Delegado de Gerencia.' });
      }
      const data = await operacionExternaService.actualizarClasificacion(req.params.id, req.body);
      await this.registrarAuditoria(req.user.id, 'ACTUALIZAR_CLASIFICACION_CLIENTE', { id: data.id, nombre: data.nombre }, null, req);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarClasificacion(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Operación restringida al Administrador o Delegado de Gerencia.' });
      }
      const data = await operacionExternaService.eliminarClasificacion(req.params.id);
      await this.registrarAuditoria(req.user.id, 'ELIMINAR_CLASIFICACION_CLIENTE', { id: req.params.id }, null, req);
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getClientesExternos(req, res) {
    try {
      const { etapa, tipo, clasificacion, search, usuarioId } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? usuarioId : req.user.id;
      const data = await operacionExternaService.getClientesExternos({
        usuarioId: targetUserId,
        etapa,
        tipo,
        clasificacion,
        search,
        esDelegado: esDel
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getClienteExternoById(req, res) {
    try {
      const data = await operacionExternaService.getClienteExternoById(req.params.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async crearClienteExterno(req, res) {
    try {
      const data = await operacionExternaService.crearClienteExterno(req.user.id, req.body);
      
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_CLIENTE_UPDATE', {
          accion: 'CREAR',
          cliente: data,
          usuarioId: req.user.id,
          usuarioNombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.user,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_CLIENTE_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CREAR_CLIENTE_EXTERNO', { id: data.id, nombre: data.nombre }, null, req);
      res.status(201).json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarClienteExterno(req, res) {
    try {
      const data = await operacionExternaService.actualizarClienteExterno(req.params.id, req.body);
      
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_CLIENTE_UPDATE', {
          accion: 'ACTUALIZAR',
          cliente: data,
          usuarioId: req.user.id,
          usuarioNombre: `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.user,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_CLIENTE_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'ACTUALIZAR_CLIENTE_EXTERNO', { id: data.id }, null, req);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async cambiarEtapaEmbudo(req, res) {
    try {
      const etapa = req.body.nuevaEtapa || req.body.etapaEmbudo || req.body.etapa;
      const nota = req.body.nota || req.body.observaciones || req.body.motivo || '';
      const data = await operacionExternaService.cambiarEtapaEmbudo(req.params.id, req.user.id, etapa, nota);
      
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_CLIENTE_UPDATE', {
          accion: 'ETAPA',
          cliente: data,
          usuarioId: req.user.id,
          nuevaEtapa: etapa,
          timestamp: Date.now()
        });
      }

      await this.registrarAuditoria(req.user.id, 'CAMBIO_ETAPA_EMBUDO', { id: req.params.id, etapa }, null, req);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarClienteExterno(req, res) {
    try {
      const { id } = req.params;
      const esDel = this.esDelegado(req.user);
      
      const cliente = await prisma.clienteExternoCampo.findUnique({ where: { id } });
      if (!cliente) {
        return res.status(404).json({ error: 'Cliente externo no encontrado.' });
      }

      if (!esDel && cliente.comercialId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para eliminar este cliente.' });
      }

      await operacionExternaService.eliminarClienteExterno(id);

      await this.registrarAuditoria(req.user.id, 'ELIMINAR_CLIENTE_EXTERNO', { id, nombre: cliente.nombre }, null, req);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_CLIENTE_UPDATE', { accion: 'ELIMINAR', id, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_CLIENTE_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Cliente externo y su historial eliminados correctamente.' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarTodosClientesExternos(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar la cartera completa de clientes.' });
      }

      const { usuarioId } = req.query;
      const result = await operacionExternaService.eliminarTodosClientesExternos({
        usuarioId: usuarioId || null,
        esDelegado: true
      });

      await this.registrarAuditoria(req.user.id, 'ELIMINAR_TODOS_CLIENTES_EXTERNOS', {
        totalEliminados: result.count,
        usuarioFiltro: usuarioId || 'TODOS'
      }, null, req);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_CLIENTE_UPDATE', { accion: 'ELIMINAR_TODOS', timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_CLIENTE_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, count: result.count, message: `Se eliminaron ${result.count} clientes externos correctamente.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getCotizacionesExternas(req, res) {
    try {
      const { clienteExternoId, estado, usuarioId } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? usuarioId : req.user.id;
      const data = await operacionExternaService.getCotizacionesExternas({
        usuarioId: targetUserId,
        clienteExternoId,
        estado,
        esDelegado: esDel
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async crearCotizacionExterna(req, res) {
    try {
      const data = await operacionExternaService.crearCotizacionExterna(req.user.id, req.body);
      await this.registrarAuditoria(req.user.id, 'CREAR_COTIZACION_EXTERNA', { id: data.id, codigo: data.codigo, total: data.total }, null, req);
      res.status(201).json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarCotizacionExterna(req, res) {
    try {
      const data = await operacionExternaService.actualizarCotizacionExterna(req.params.id, req.user.id, req.body);
      await this.registrarAuditoria(req.user.id, 'ACTUALIZAR_COTIZACION_EXTERNA', { id: data.id, codigo: data.codigo, total: data.total }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_COTIZACION_EXTERNA_UPDATE', timestamp: Date.now() });
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarCotizacionExterna(req, res) {
    try {
      await operacionExternaService.eliminarCotizacionExterna(req.params.id);
      await this.registrarAuditoria(req.user.id, 'ELIMINAR_COTIZACION_EXTERNA', { id: req.params.id }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_COTIZACION_EXTERNA_DELETE', timestamp: Date.now() });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarTodasCotizacionesExternas(req, res) {
    try {
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? (req.query.usuarioId || null) : req.user.id;
      const result = await operacionExternaService.eliminarTodasCotizacionesExternas(targetUserId);
      await this.registrarAuditoria(req.user.id, 'ELIMINAR_TODAS_COTIZACIONES_EXTERNAS', { count: result.count }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_COTIZACION_EXTERNA_CLEAR', timestamp: Date.now() });
      res.json({ success: true, eliminadas: result.count });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async cambiarEstadoCotizacion(req, res) {
    try {
      const { nuevoEstado, nota } = req.body;
      const data = await operacionExternaService.cambiarEstadoCotizacion(req.params.id, req.user.id, nuevoEstado, nota);
      await this.registrarAuditoria(req.user.id, 'CAMBIO_ESTADO_COTIZACION', { id: req.params.id, nuevoEstado }, null, req);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async agregarSeguimientoCotizacion(req, res) {
    try {
      const data = await operacionExternaService.agregarSeguimientoCotizacion(req.params.id, req.user.id, {
        ...req.body,
        usuarioNombre: `${req.user.nombre} ${req.user.apellido}`
      });
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getVentasExternas(req, res) {
    try {
      const { clienteExternoId, usuarioId } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? usuarioId : req.user.id;
      const data = await operacionExternaService.getVentasExternas({
        usuarioId: targetUserId,
        clienteExternoId,
        esDelegado: esDel
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async registrarVentaExterna(req, res) {
    try {
      const data = await operacionExternaService.registrarVentaExterna(req.user.id, req.body);
      await this.registrarAuditoria(req.user.id, 'REGISTRAR_VENTA_EXTERNA', { id: data.id, codigo: data.codigo, valor: data.valorVendido }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_VENTA_EXTERNA_CREATE', timestamp: Date.now() });
      res.status(201).json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarVentaExterna(req, res) {
    try {
      const data = await operacionExternaService.actualizarVentaExterna(req.params.id, req.user.id, req.body);
      await this.registrarAuditoria(req.user.id, 'ACTUALIZAR_VENTA_EXTERNA', { id: data.id, codigo: data.codigo, valor: data.valorVendido }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_VENTA_EXTERNA_UPDATE', timestamp: Date.now() });
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarVentaExterna(req, res) {
    try {
      await operacionExternaService.eliminarVentaExterna(req.params.id);
      await this.registrarAuditoria(req.user.id, 'ELIMINAR_VENTA_EXTERNA', { id: req.params.id }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_VENTA_EXTERNA_DELETE', timestamp: Date.now() });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async eliminarTodasVentasExternas(req, res) {
    try {
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? (req.query.usuarioId || null) : req.user.id;
      const result = await operacionExternaService.eliminarTodasVentasExternas(targetUserId);
      await this.registrarAuditoria(req.user.id, 'ELIMINAR_TODAS_VENTAS_EXTERNAS', { count: result.count }, null, req);
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) io.emit('db_update', { type: 'CAMPO_VENTA_EXTERNA_CLEAR', timestamp: Date.now() });
      res.json({ success: true, eliminadas: result.count });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getMetricasEmbudo(req, res) {
    try {
      const { usuarioId } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? usuarioId : req.user.id;
      const data = await operacionExternaService.getMetricasEmbudo(targetUserId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- HISTORIAL DETALLADO DE VISITAS PARA AUDITORÍA GERENCIAL ---
  async getHistorialVisitas(req, res) {
    try {
      const esDel = this.esDelegado(req.user);
      const filtros = { ...req.query };
      if (!esDel) {
        filtros.usuarioId = req.user.id;
      }
      const visitas = await visitasService.getHistorialVisitas(filtros);
      res.json(visitas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- CIERRE ADMINISTRATIVO DE JORNADA DE CAMPO ---
  async cerrarJornadaAdministrativa(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido al Delegado de Gerencia.' });
      }
      const { jornadaId, motivo } = req.body;
      if (!jornadaId) return res.status(400).json({ error: 'jornadaId es requerido' });

      const resultado = await jornadaService.cerrarJornadaAdministrativa(jornadaId, req.user.id, motivo);

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_JORNADA_UPDATE', { accion: 'FIN', jornadaId, motivo, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_JORNADA_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_CIERRE_ADMIN', { jornadaId, motivo }, null, req);
      res.json({ success: true, jornada: resultado });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // --- RESUMEN CONSOLIDADO DE GESTIÓN POR PERÍODO (DIARIO / SEMANAL / MENSUAL) ---
  async getResumenPeriodoComercial(req, res) {
    try {
      const esDel = this.esDelegado(req.user);
      const { usuarioId, periodo = 'hoy', fechaDesde, fechaHasta } = req.query;
      const targetUserId = esDel ? (usuarioId && usuarioId !== 'TODOS' ? usuarioId : null) : req.user.id;

      const ahora = new Date();
      let inicio = new Date(ahora);
      inicio.setHours(0, 0, 0, 0);
      let fin = new Date(ahora);
      fin.setHours(23, 59, 59, 999);

      if (periodo === 'semana') {
        const diaSemana = ahora.getDay();
        const diffDias = diaSemana === 0 ? 6 : diaSemana - 1; // Lunes
        inicio.setDate(ahora.getDate() - diffDias);
      } else if (periodo === 'mes') {
        inicio.setDate(1);
      } else if (fechaDesde || fechaHasta) {
        if (fechaDesde) {
          inicio = new Date(fechaDesde);
          inicio.setHours(0, 0, 0, 0);
        }
        if (fechaHasta) {
          fin = new Date(fechaHasta);
          fin.setHours(23, 59, 59, 999);
        }
      }

      const userWhere = targetUserId ? { usuarioId: targetUserId } : {};
      const comWhere = targetUserId ? { comercialId: targetUserId } : {};

      // 1. Jornadas
      const jornadas = await prisma.jornadaLaboral.findMany({
        where: {
          ...userWhere,
          horaInicio: { gte: inicio, lte: fin }
        },
        select: { id: true, estado: true, tiempoTotalMin: true, distanciaKm: true, totalVisitas: true }
      });

      const totalJornadas = jornadas.length;
      const minutosTotales = jornadas.reduce((acc, j) => acc + (j.tiempoTotalMin || 0), 0);
      const horasTotales = Number((minutosTotales / 60).toFixed(1));
      const kmTotales = Number(jornadas.reduce((acc, j) => acc + (j.distanciaKm || 0), 0).toFixed(1));

      // 2. Visitas
      const visitas = await prisma.visitaCampo.findMany({
        where: {
          ...userWhere,
          fechaProgramada: { gte: inicio, lte: fin }
        },
        select: { id: true, estado: true, resultadoVisita: true, duracionMin: true }
      });
      const totalVisitas = visitas.length;
      const visitasEfectivas = visitas.filter(v => v.estado === 'Realizada' || v.resultadoVisita === 'Venta Cerrada' || v.resultadoVisita === 'Cotización Solicitada').length;
      const efectividadPct = totalVisitas > 0 ? Math.round((visitasEfectivas / totalVisitas) * 100) : 0;

      // 3. Cotizaciones
      const cotizaciones = await prisma.cotizacionExternaCampo.findMany({
        where: {
          ...comWhere,
          fecha: { gte: inicio, lte: fin }
        },
        select: { id: true, total: true, estado: true }
      });
      const totalCotizaciones = cotizaciones.length;
      const montoCotizado = cotizaciones.reduce((acc, c) => acc + (c.total || 0), 0);

      // 4. Ventas
      const ventas = await prisma.ventaExternaCampo.findMany({
        where: {
          ...comWhere,
          fecha: { gte: inicio, lte: fin }
        },
        select: { id: true, valorVendido: true }
      });
      const totalVentas = ventas.length;
      const montoVendido = ventas.reduce((acc, v) => acc + (parseFloat(v.valorVendido) || 0), 0);

      // 5. Tareas/Actividades
      const actividades = await prisma.actividadCampo.findMany({
        where: {
          ...userWhere,
          fechaProgramada: { gte: inicio, lte: fin }
        },
        select: { id: true, estado: true }
      });
      const totalTareas = actividades.length;
      const tareasCumplidas = actividades.filter(a => a.estado === 'Completada').length;

      res.json({
        periodo,
        fechaInicio: inicio.toISOString(),
        fechaFin: fin.toISOString(),
        usuarioId: targetUserId || 'TODOS',
        kpis: {
          totalJornadas,
          horasTotales,
          kmTotales,
          totalVisitas,
          visitasEfectivas,
          efectividadPct,
          totalCotizaciones,
          montoCotizado,
          totalVentas,
          montoVendido,
          totalTareas,
          tareasCumplidas
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 16. RUTAS DIARIAS Y CONTROL DE MOVIMIENTOS (LLEGADA / SALIDA POR LUGAR) ---
  async registrarLlegadaMovimiento(req, res) {
    try {
      const {
        lugar,
        direccion,
        motivo,
        clienteExternoId,
        clienteId,
        contacto,
        lat,
        lng,
        precision,
        notas,
        jornadaId,
        horaLlegada,
        horaSalida,
        fecha,
        actividadesRealizadas,
        resultado
      } = req.body;

      if (!lugar || !String(lugar).trim()) {
        return res.status(400).json({ error: 'Debe indicar el nombre del lugar o destino al que llega.' });
      }

      const targetUserId = (this.esDelegado(req.user) && req.body.usuarioId) ? req.body.usuarioId : req.user.id;
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const numLat = !Number.isNaN(parsedLat) ? parsedLat : null;
      const numLng = !Number.isNaN(parsedLng) ? parsedLng : null;

      // Resolver fecha y hora de llegada (hora oficial Colombia America/Bogota / UTC-5)
      let ahora;
      if (horaLlegada) {
        if (typeof horaLlegada === 'string' && horaLlegada.includes('T') && horaLlegada.includes('-05:00')) {
          ahora = new Date(horaLlegada);
        } else if (typeof horaLlegada === 'string' && horaLlegada.includes(':')) {
          ahora = parseColombiaDateTime(fecha, horaLlegada);
        } else {
          ahora = new Date(horaLlegada);
        }
      } else if (fecha) {
        ahora = parseColombiaDateTime(fecha, null);
      } else {
        ahora = new Date();
      }

      // Si también se envió hora de salida (parada ya concluida / registro completo)
      let checkOutDate = null;
      let duracionMin = 0;
      let estadoVisita = 'En Curso';
      if (horaSalida) {
        if (typeof horaSalida === 'string' && horaSalida.includes('T') && horaSalida.includes('-05:00')) {
          checkOutDate = new Date(horaSalida);
        } else if (typeof horaSalida === 'string' && horaSalida.includes(':')) {
          checkOutDate = parseColombiaDateTime(fecha || ahora, horaSalida);
        } else {
          checkOutDate = new Date(horaSalida);
        }
        if (checkOutDate > ahora) {
          duracionMin = Math.max(1, Math.round((checkOutDate - ahora) / 60000));
        } else {
          duracionMin = 0;
        }
        estadoVisita = 'Realizada';
      }

      // Buscar jornada activa del usuario hoy si no se proporcionó jornadaId
      let resolvedJornadaId = jornadaId || null;
      if (!resolvedJornadaId) {
        const startOfDay = new Date(ahora);
        startOfDay.setHours(0, 0, 0, 0);
        const jornadaHoy = await prisma.jornadaLaboral.findFirst({
          where: {
            usuarioId: targetUserId,
            horaInicio: { gte: startOfDay }
          },
          orderBy: { horaInicio: 'desc' }
        });
        if (jornadaHoy) resolvedJornadaId = jornadaHoy.id;
      }

      // Si el asesor ya tenía una parada "En Curso" y este NO es un registro cerrado histórico, cerrarla con la hora de llegada a este nuevo punto
      if (!checkOutDate) {
        const paradaAbierta = await prisma.visitaCampo.findFirst({
          where: {
            usuarioId: targetUserId,
            estado: 'En Curso',
            checkInHora: { not: null },
            checkOutHora: null
          },
          orderBy: { checkInHora: 'desc' }
        });

        if (paradaAbierta) {
          const checkInPrevio = new Date(paradaAbierta.checkInHora);
          const diffMinRaw = Math.max(1, Math.round((ahora - checkInPrevio) / 60000));
          const esMismoDia = getFechaColombia(ahora) === getFechaColombia(checkInPrevio);
          const duracionMinAuto = (esMismoDia && diffMinRaw <= 240) ? diffMinRaw : 30;
          const checkOutAuto = (esMismoDia && diffMinRaw <= 240)
            ? ahora
            : new Date(checkInPrevio.getTime() + duracionMinAuto * 60000);
          await prisma.visitaCampo.update({
            where: { id: paradaAbierta.id },
            data: {
              estado: 'Realizada',
              checkOutHora: checkOutAuto,
              checkOutLat: numLat ?? paradaAbierta.checkInLat,
              checkOutLng: numLng ?? paradaAbierta.checkInLng,
              duracionMin: duracionMinAuto,
              resultadoVisita: paradaAbierta.resultadoVisita || 'Salida automática por nueva llegada',
              observaciones: `${paradaAbierta.observaciones || ''} (Cierre por llegada a nueva parada).`.trim()
            }
          }).catch(() => {});
        }
      }

      // Verificar si corresponde a una parada programada (de Ruta Asignada o Agenda del día)
      let paradaProgramada = null;
      if (req.body.visitaProgramadaId) {
        paradaProgramada = await prisma.visitaCampo.findUnique({ where: { id: req.body.visitaProgramadaId } }).catch(() => null);
      } else {
        const sDay = new Date(ahora);
        sDay.setHours(0, 0, 0, 0);
        const eDay = new Date(ahora);
        eDay.setHours(23, 59, 59, 999);
        paradaProgramada = await prisma.visitaCampo.findFirst({
          where: {
            usuarioId: targetUserId,
            estado: 'Programada',
            checkInHora: null,
            fechaProgramada: { gte: sDay, lte: eDay },
            OR: [
              ...(clienteExternoId ? [{ clienteExternoId }] : []),
              { resultadoResumen: { equals: String(lugar).trim(), mode: 'insensitive' } }
            ]
          }
        }).catch(() => null);
      }

      let nuevoMovimiento;
      let codigo;

      if (paradaProgramada) {
        codigo = paradaProgramada.codigo;
        nuevoMovimiento = await prisma.visitaCampo.update({
          where: { id: paradaProgramada.id },
          data: {
            jornadaId: resolvedJornadaId || paradaProgramada.jornadaId,
            clienteId: clienteId || paradaProgramada.clienteId || null,
            clienteExternoId: clienteExternoId || paradaProgramada.clienteExternoId || null,
            tipoVisita: motivo || paradaProgramada.tipoVisita || 'Parada en Ruta',
            estado: estadoVisita,
            checkInHora: ahora,
            checkInLat: numLat,
            checkInLng: numLng,
            checkInPrecision: precision ? parseFloat(precision) : null,
            checkOutHora: checkOutDate,
            checkOutLat: checkOutDate ? numLat : null,
            checkOutLng: checkOutDate ? numLng : null,
            duracionMin: duracionMin || (checkOutDate ? 1 : 0),
            resultadoResumen: String(lugar).trim(),
            actividadesRealizadas: (actividadesRealizadas || '').trim() || paradaProgramada.actividadesRealizadas || null,
            resultadoVisita: resultado || (checkOutDate ? 'Completada' : null),
            observaciones: notas ? `${paradaProgramada.observaciones || ''} | ${notas}`.trim() : (paradaProgramada.observaciones || `Llegada a ${String(lugar).trim()}`),
            contactoAtendio: contacto ? String(contacto).trim() : paradaProgramada.contactoAtendio,
            firmaCliente: req.body.firmaCliente || paradaProgramada.firmaCliente || null,
            evidencias: Array.isArray(req.body.evidencias) ? req.body.evidencias : (paradaProgramada.evidencias || [])
          },
          include: {
            usuario: { select: { id: true, nombre: true, apellido: true, user: true, cargo: true, foto: true } },
            cliente: true,
            clienteExterno: true
          }
        });
      } else {
        const count = await prisma.visitaCampo.count();
        codigo = `MOV-${Date.now().toString().slice(-6)}-${String(count + 1).slice(-3)}`;

        nuevoMovimiento = await prisma.visitaCampo.create({
          data: {
            codigo,
            usuarioId: targetUserId,
            jornadaId: resolvedJornadaId,
            clienteId: clienteId || null,
            clienteExternoId: clienteExternoId || null,
            tipoVisita: motivo || 'Parada en Ruta',
            estado: estadoVisita,
            fechaProgramada: ahora,
            checkInHora: ahora,
            checkInLat: numLat,
            checkInLng: numLng,
            checkInPrecision: precision ? parseFloat(precision) : null,
            checkOutHora: checkOutDate,
            checkOutLat: checkOutDate ? numLat : null,
            checkOutLng: checkOutDate ? numLng : null,
            duracionMin: duracionMin || (checkOutDate ? 1 : 0),
            resultadoResumen: String(lugar).trim(),
            actividadesRealizadas: (actividadesRealizadas || '').trim() || null,
            resultadoVisita: resultado || (checkOutDate ? 'Completada' : null),
            observaciones: (notas || `Llegada a ${String(lugar).trim()}${direccion ? ` (${String(direccion).trim()})` : ''}`).trim(),
            contactoAtendio: contacto ? String(contacto).trim() : null,
            firmaCliente: req.body.firmaCliente || null,
            evidencias: Array.isArray(req.body.evidencias) ? req.body.evidencias : []
          },
          include: {
            usuario: { select: { id: true, nombre: true, apellido: true, user: true, cargo: true, foto: true } },
            cliente: true,
            clienteExterno: true
          }
        });
      }

      // Actualizar posición en vivo del usuario SOLO si hay coordenadas reales
      if (numLat !== null && numLng !== null) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: {
            lat: numLat,
            lng: numLng,
            lastLocationUpdate: Date.now(),
            isOnline: true
          }
        }).catch(() => {});
      }

      const usuarioNombre = `${req.user.nombre || ''} ${req.user.apellido || ''}`.trim() || req.user.user;
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_MOVIMIENTO_UPDATE', {
          accion: 'LLEGADA',
          movimiento: nuevoMovimiento,
          usuarioId: req.user.id,
          usuarioNombre,
          lugar: String(lugar).trim(),
          horaLlegada: ahora.toISOString(),
          lat: numLat,
          lng: numLng,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_MOVIMIENTO_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_MOVIMIENTO_LLEGADA', {
        movimientoId: nuevoMovimiento.id,
        codigo,
        lugar: String(lugar).trim(),
        motivo,
        lat: numLat,
        lng: numLng,
        hora: ahora.toISOString()
      }, { usuarioNombre }, req);

      res.status(201).json({
        success: true,
        message: `Llegada registrada exitosamente en ${String(lugar).trim()}.`,
        movimiento: nuevoMovimiento
      });
    } catch (err) {
      console.error('[registrarLlegadaMovimiento Error]', err);
      res.status(500).json({ error: err.message || 'Error registrando llegada a la parada.' });
    }
  }

  async registrarSalidaMovimiento(req, res) {
    try {
      const {
        movimientoId,
        lat,
        lng,
        actividadesRealizadas,
        observaciones,
        resultado,
        evidencias
      } = req.body;

      if (!movimientoId) {
        return res.status(400).json({ error: 'Debe especificar el ID del movimiento a finalizar.' });
      }

      const movimiento = await prisma.visitaCampo.findUnique({
        where: { id: movimientoId },
        include: { usuario: true }
      });

      if (!movimiento) {
        return res.status(404).json({ error: 'Movimiento no encontrado.' });
      }

      if (!this.esDelegado(req.user) && movimiento.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para modificar este registro.' });
      }

      let checkOutHora = new Date();
      if (req.body.horaSalida) {
        if (typeof req.body.horaSalida === 'string' && req.body.horaSalida.includes('T') && req.body.horaSalida.includes('-05:00')) {
          checkOutHora = new Date(req.body.horaSalida);
        } else if (typeof req.body.horaSalida === 'string' && req.body.horaSalida.includes(':')) {
          const baseDateStr = req.body.fecha || (movimiento.checkInHora ? getFechaColombia(movimiento.checkInHora) : getFechaColombia(new Date()));
          checkOutHora = parseColombiaDateTime(baseDateStr, req.body.horaSalida);
        }
      }
      const inicio = movimiento.checkInHora ? new Date(movimiento.checkInHora) : checkOutHora;
      const duracionMin = Math.max(1, Math.round((checkOutHora - inicio) / 60000));
      const parsedOutLat = parseFloat(lat);
      const parsedOutLng = parseFloat(lng);
      const numLat = !Number.isNaN(parsedOutLat) ? parsedOutLat : (movimiento.checkInLat || null);
      const numLng = !Number.isNaN(parsedOutLng) ? parsedOutLng : (movimiento.checkInLng || null);

      const obsTexto = (observaciones || actividadesRealizadas || movimiento.observaciones || 'Salida registrada correctamente').trim();
      const resultadoFinal = resultado || 'Completada';
      const existingEvidencias = Array.isArray(movimiento.evidencias) ? movimiento.evidencias : [];
      const adjuntosArr = Array.isArray(evidencias) && evidencias.length > 0 ? [...existingEvidencias, ...evidencias] : existingEvidencias;

      const actualizado = await prisma.visitaCampo.update({
        where: { id: movimientoId },
        data: {
          estado: 'Realizada',
          checkOutHora,
          checkOutLat: numLat,
          checkOutLng: numLng,
          duracionMin,
          actividadesRealizadas: (actividadesRealizadas || '').trim() || movimiento.actividadesRealizadas || null,
          observaciones: obsTexto,
          resultadoVisita: resultadoFinal,
          firmaCliente: req.body.firmaCliente || movimiento.firmaCliente || null,
          evidencias: adjuntosArr
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, user: true, cargo: true, foto: true } },
          cliente: true,
          clienteExterno: true
        }
      });

      // Actualizar ubicación en vivo del usuario si hay coordenadas reales
      if (numLat !== null && numLng !== null) {
        await prisma.user.update({
          where: { id: movimiento.usuarioId },
          data: {
            lat: numLat,
            lng: numLng,
            lastLocationUpdate: Date.now()
          }
        }).catch(() => {});
      }

      // Si la parada pertenece a una Ruta Asignada ([Ruta RUT-XXXXX]), sincronizar el avance de la ruta
      const matchRuta = (actualizado.observaciones || '').match(/\[Ruta (RUT-[^\]]+)\]/);
      if (matchRuta && matchRuta[1]) {
        const codigoRuta = matchRuta[1];
        const paradasDeRuta = await prisma.visitaCampo.findMany({
          where: {
            usuarioId: movimiento.usuarioId,
            observaciones: { contains: `[Ruta ${codigoRuta}]` }
          }
        }).catch(() => []);
        if (paradasDeRuta.length > 0) {
          const todasRealizadas = paradasDeRuta.every(p => p.estado === 'Realizada' || p.checkOutHora != null);
          const algunaIniciada = paradasDeRuta.some(p => p.checkInHora != null);
          await prisma.actividadCampo.updateMany({
            where: { codigo: codigoRuta, estado: { notIn: ['Aprobada'] } },
            data: {
              estado: todasRealizadas ? 'Completada' : (algunaIniciada ? 'En Curso' : 'Pendiente'),
              ...(todasRealizadas ? { fechaFinalizacion: checkOutHora } : {})
            }
          }).catch(() => {});
        }
      }

      const usuarioNombre = `${actualizado.usuario?.nombre || ''} ${actualizado.usuario?.apellido || ''}`.trim() || actualizado.usuario?.user || 'Asesor';
      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_MOVIMIENTO_UPDATE', {
          accion: 'SALIDA',
          movimiento: actualizado,
          usuarioId: movimiento.usuarioId,
          usuarioNombre,
          lugar: actualizado.resultadoResumen,
          horaSalida: checkOutHora.toISOString(),
          duracionMin,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_MOVIMIENTO_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_MOVIMIENTO_SALIDA', {
        movimientoId,
        codigo: actualizado.codigo,
        lugar: actualizado.resultadoResumen,
        duracionMin,
        resultado: resultadoFinal,
        horaSalida: checkOutHora.toISOString()
      }, { usuarioNombre }, req);

      res.json({
        success: true,
        message: `Salida registrada exitosamente. Permanencia: ${duracionMin} minutos.`,
        movimiento: actualizado
      });
    } catch (err) {
      console.error('[registrarSalidaMovimiento Error]', err);
      res.status(500).json({ error: err.message || 'Error registrando salida del lugar.' });
    }
  }

  async actualizarMovimiento(req, res) {
    try {
      const { id } = req.params;
      const {
        lugar,
        direccion,
        motivo,
        contacto,
        horaLlegada,
        horaSalida,
        fecha,
        actividadesRealizadas,
        observaciones,
        resultado
      } = req.body;

      const movimiento = await prisma.visitaCampo.findUnique({
        where: { id },
        include: { usuario: true, cliente: true, clienteExterno: true }
      });

      if (!movimiento) {
        return res.status(404).json({ error: 'Movimiento o parada no encontrada.' });
      }

      if (!this.esDelegado(req.user) && movimiento.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para editar este movimiento.' });
      }

      // Resolver fecha base de la parada en Colombia (UTC-5)
      let targetFechaStr = fecha;
      if (!targetFechaStr) {
        if (movimiento.checkInHora) {
          targetFechaStr = getFechaColombia(movimiento.checkInHora);
        } else if (movimiento.fechaProgramada) {
          targetFechaStr = getFechaColombia(movimiento.fechaProgramada);
        } else {
          targetFechaStr = getFechaColombia(new Date());
        }
      }

      // Resolver hora de llegada en hora oficial Colombia
      let newCheckIn = movimiento.checkInHora;
      if (horaLlegada) {
        if (typeof horaLlegada === 'string' && horaLlegada.includes('T') && horaLlegada.includes('-05:00')) {
          newCheckIn = new Date(horaLlegada);
        } else if (typeof horaLlegada === 'string' && horaLlegada.includes(':')) {
          newCheckIn = parseColombiaDateTime(targetFechaStr, horaLlegada);
        } else {
          newCheckIn = new Date(horaLlegada);
        }
      } else if (fecha && movimiento.checkInHora) {
        // Se cambió fecha pero se mantiene la hora original de llegada
        const oldHora = getHoraColombia(movimiento.checkInHora);
        newCheckIn = parseColombiaDateTime(targetFechaStr, oldHora);
      }

      // Resolver hora de salida en hora oficial Colombia
      let newCheckOut = movimiento.checkOutHora;
      if (horaSalida !== undefined) {
        if (!horaSalida || !String(horaSalida).trim()) {
          newCheckOut = null;
        } else if (typeof horaSalida === 'string' && horaSalida.includes('T') && horaSalida.includes('-05:00')) {
          newCheckOut = new Date(horaSalida);
        } else if (typeof horaSalida === 'string' && horaSalida.includes(':')) {
          newCheckOut = parseColombiaDateTime(targetFechaStr, horaSalida);
        } else {
          newCheckOut = new Date(horaSalida);
        }
      } else if (fecha && movimiento.checkOutHora) {
        // Se cambió fecha pero se mantiene la hora original de salida
        const oldOutHora = getHoraColombia(movimiento.checkOutHora);
        newCheckOut = parseColombiaDateTime(targetFechaStr, oldOutHora);
      }

      let duracionMin = movimiento.duracionMin || 0;
      if (newCheckIn && newCheckOut) {
        duracionMin = Math.max(1, Math.round((new Date(newCheckOut) - new Date(newCheckIn)) / 60000));
      } else if (newCheckIn && !newCheckOut) {
        duracionMin = Math.max(1, Math.round((Date.now() - new Date(newCheckIn)) / 60000));
      }

      const estado = newCheckOut ? 'Realizada' : (newCheckIn ? 'En Curso' : movimiento.estado);

      const dataToUpdate = {
        estado,
        checkInHora: newCheckIn,
        checkOutHora: newCheckOut,
        duracionMin,
        fechaProgramada: newCheckIn ? new Date(newCheckIn) : (fecha ? parseColombiaDateTime(targetFechaStr, '12:00') : movimiento.fechaProgramada)
      };

      if (lugar !== undefined && String(lugar).trim()) dataToUpdate.resultadoResumen = String(lugar).trim();
      if (motivo !== undefined && String(motivo).trim()) dataToUpdate.tipoVisita = String(motivo).trim();
      if (contacto !== undefined) dataToUpdate.contactoAtendio = String(contacto).trim();
      if (actividadesRealizadas !== undefined) dataToUpdate.actividadesRealizadas = String(actividadesRealizadas).trim() || null;
      if (observaciones !== undefined) dataToUpdate.observaciones = String(observaciones).trim() || null;
      if (resultado !== undefined && String(resultado).trim()) dataToUpdate.resultadoVisita = String(resultado).trim();

      if (direccion !== undefined) {
        const dirTrimmed = String(direccion).trim();
        if (movimiento.clienteExternoId) {
          await prisma.clienteExternoCampo.update({
            where: { id: movimiento.clienteExternoId },
            data: { direccion: dirTrimmed }
          }).catch(() => {});
        }
        if (dirTrimmed) {
          let obs = dataToUpdate.observaciones !== undefined ? (dataToUpdate.observaciones || '') : (movimiento.observaciones || '');
          if (obs.includes('(') && obs.includes(')')) {
            obs = obs.replace(/\((.*?)\)/, `(${dirTrimmed})`);
          } else {
            obs = obs ? `${obs} (${dirTrimmed})` : `(${dirTrimmed})`;
          }
          dataToUpdate.observaciones = obs;
        }
      }

      const actualizado = await prisma.visitaCampo.update({
        where: { id },
        data: dataToUpdate,
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, user: true, cargo: true, foto: true } },
          cliente: true,
          clienteExterno: true
        }
      });

      const usuarioNombre = `${actualizado.usuario?.nombre || ''} ${actualizado.usuario?.apellido || ''}`.trim() || actualizado.usuario?.user || 'Asesor';

      let dirRetorno = actualizado.clienteExterno?.direccion || actualizado.cliente?.dir || (typeof direccion === 'string' ? direccion : '') || '';
      if (!dirRetorno && actualizado.observaciones && actualizado.observaciones.includes('(') && actualizado.observaciones.includes(')')) {
        const match = actualizado.observaciones.match(/\((.*?)\)/);
        if (match && match[1]) dirRetorno = match[1];
      }

      const movimientoRetorno = {
        ...actualizado,
        usuarioNombre,
        asesorNombre: usuarioNombre,
        usuarioCargo: actualizado.usuario?.cargo || 'Asesor Comercial',
        lugar: actualizado.resultadoResumen || actualizado.clienteExterno?.nombre || actualizado.cliente?.nom || 'Punto de Ruta',
        direccion: dirRetorno,
        motivo: actualizado.tipoVisita,
        contacto: actualizado.contactoAtendio || actualizado.clienteExterno?.contacto || '',
        resultado: actualizado.resultadoVisita || (actualizado.checkOutHora ? 'Completada' : 'En Curso'),
        duracionMin,
        estado: actualizado.checkOutHora ? 'Realizada' : (actualizado.checkInHora ? 'En el Lugar' : actualizado.estado),
        checkInHora: actualizado.checkInHora,
        checkOutHora: actualizado.checkOutHora
      };

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_MOVIMIENTO_UPDATE', {
          accion: 'EDICION',
          movimiento: movimientoRetorno,
          usuarioId: movimiento.usuarioId,
          usuarioNombre,
          lugar: actualizado.resultadoResumen,
          fecha: targetFechaStr,
          timestamp: Date.now()
        });
        io.emit('db_update', { type: 'CAMPO_MOVIMIENTO_UPDATE', timestamp: Date.now() });
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_MOVIMIENTO_EDITADO', {
        id,
        codigo: actualizado.codigo,
        lugar: actualizado.resultadoResumen,
        checkInHora: newCheckIn?.toISOString(),
        checkOutHora: newCheckOut?.toISOString(),
        duracionMin
      }, { usuarioNombre }, req);

      res.json({
        success: true,
        message: 'Ruta / Parada actualizada exitosamente.',
        movimiento: movimientoRetorno
      });
    } catch (err) {
      console.error('[actualizarMovimiento Error]', err);
      res.status(500).json({ error: err.message || 'Error actualizando el movimiento.' });
    }
  }

  async getMovimientoActivo(req, res) {
    try {
      const movimientoActivo = await prisma.visitaCampo.findFirst({
        where: {
          usuarioId: req.user.id,
          estado: 'En Curso',
          checkInHora: { not: null },
          checkOutHora: null
        },
        include: {
          cliente: true,
          clienteExterno: true
        },
        orderBy: { checkInHora: 'desc' }
      });

      if (!movimientoActivo) {
        return res.json({ success: true, movimientoActivo: null });
      }

      const ahora = new Date();
      const inicio = new Date(movimientoActivo.checkInHora);
      const minutosTranscurridos = Math.max(1, Math.round((ahora - inicio) / 60000));

      res.json({
        success: true,
        movimientoActivo: {
          ...movimientoActivo,
          minutosTranscurridos
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- CONTROL GERENCIAL: PANELES INDEPENDIENTES POR ASESOR COMERCIAL ---
  async getPanelGerencialMovimientos(req, res) {
    try {
      const { fecha, usuarioId, busqueda } = req.query;
      const esDel = this.esDelegado(req.user);

      // 1. Obtener lista estricta de usuarios que tienen el rol de Operador en Campo (excluir Delegados de Gerencia)
      const whereUsers = {
        ...this.getFiltroOperadoresCampo()
      };

      if (!esDel && req.user?.id) {
        whereUsers.id = String(req.user.id);
      } else if (usuarioId && usuarioId !== 'TODOS') {
        whereUsers.id = String(usuarioId);
      }

      const usuariosCampo = await prisma.user.findMany({
        where: whereUsers,
        select: {
          id: true,
          nombre: true,
          apellido: true,
          user: true,
          cargo: true,
          telefono: true,
          correo: true,
          foto: true,
          isOnline: true,
          lat: true,
          lng: true,
          lastLocationUpdate: true,
          roleId: true,
          esComercialCampo: true,
          esDelegadoGerencia: true,
          role: { select: { id: true, name: true } }
        },
        orderBy: { nombre: 'asc' }
      });

      const userIds = usuariosCampo.map(u => u.id);

      // Si el usuario actual no es delegado y no está en la lista (por alguna configuración de cargo), incluirlo para que pueda ver su panel
      if (!esDel && !userIds.includes(req.user.id)) {
        const me = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: {
            id: true,
            nombre: true,
            apellido: true,
            user: true,
            cargo: true,
            telefono: true,
            correo: true,
            foto: true,
            isOnline: true,
            lat: true,
            lng: true,
            lastLocationUpdate: true,
            roleId: true,
            esComercialCampo: true,
            esDelegadoGerencia: true,
            role: { select: { id: true, name: true } }
          }
        });
        if (me) {
          usuariosCampo.push(me);
          userIds.push(me.id);
        }
      }

      // 2. Resolver filtro de fecha para las visitas
      // NOTA: Para no perder histórico permanente, si fecha es 'TODOS' o vacía, no se filtra por fecha.
      let fechaStr = fecha;
      const whereVisitas = {
        usuarioId: { in: userIds }
      };

      if (fecha && fecha !== 'TODOS' && fecha !== 'ALL' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const startOfDay = new Date(`${fecha}T00:00:00-05:00`);
        const endOfDay = new Date(`${fecha}T23:59:59.999-05:00`);
        whereVisitas.OR = [
          { checkInHora: { gte: startOfDay, lte: endOfDay } },
          { checkInHora: null, fechaProgramada: { gte: startOfDay, lte: endOfDay } }
        ];
      } else {
        fechaStr = 'TODOS';
      }

      // 3. Consultar visitas de base de datos ordenadas cronológicamente
      const todasVisitas = await prisma.visitaCampo.findMany({
        where: whereVisitas,
        include: {
          usuario: {
            select: { id: true, nombre: true, apellido: true, user: true, cargo: true, foto: true }
          },
          cliente: true,
          clienteExterno: true,
          prospecto: true
        },
        orderBy: [
          { checkInHora: 'asc' },
          { createdAt: 'asc' }
        ]
      });

      // 4. Consultar jornadas activas / recientes de estos usuarios
      const ahora = new Date();
      const startOfToday = new Date(ahora);
      startOfToday.setHours(0, 0, 0, 0);

      const jornadasRecientes = await prisma.jornadaLaboral.findMany({
        where: {
          usuarioId: { in: userIds },
          OR: [
            { estado: { in: ['Iniciada', 'En Pausa', 'En Ruta', 'Activa'] } },
            { horaInicio: { gte: startOfToday } }
          ]
        },
        orderBy: { horaInicio: 'desc' }
      });

      const jornadaPorUsuario = new Map();
      jornadasRecientes.forEach(j => {
        if (!jornadaPorUsuario.has(j.usuarioId)) {
          jornadaPorUsuario.set(j.usuarioId, j);
        }
      });

      // 5. Agrupar visitas por usuario y calcular métricas individuales
      const visitasPorUsuario = new Map();
      todasVisitas.forEach(v => {
        const uId = v.usuarioId;
        if (!visitasPorUsuario.has(uId)) {
          visitasPorUsuario.set(uId, []);
        }
        visitasPorUsuario.get(uId).push(v);
      });

      const asesoresPaneles = usuariosCampo.map(u => {
        const uVisitas = visitasPorUsuario.get(u.id) || [];
        const j = jornadaPorUsuario.get(u.id);

        // Parada en curso si existe
        const paradaEnCurso = uVisitas.find(v => v.estado === 'En Curso' || v.estado === 'En el Lugar' || (v.checkInHora && !v.checkOutHora));

        // Determinar estado oficial para el banner:
        // "Visitando Cliente", "En ruta", "En pausa", "Finalizada", "Disponible", "Sin actividad"
        let estado = 'Sin actividad';
        let estadoColor = 'gray';

        if (paradaEnCurso) {
          estado = 'Visitando Cliente';
          estadoColor = 'amber';
        } else if (j && ['Iniciada', 'En Ruta', 'Activa'].includes(j.estado)) {
          estado = 'En ruta';
          estadoColor = 'emerald';
        } else if (j && j.estado === 'En Pausa') {
          estado = 'En pausa';
          estadoColor = 'orange';
        } else if (j && j.estado === 'Finalizada') {
          estado = 'Finalizada';
          estadoColor = 'slate';
        } else if (u.isOnline) {
          estado = 'Disponible';
          estadoColor = 'blue';
        } else if (uVisitas.length > 0) {
          estado = 'Finalizada';
          estadoColor = 'slate';
        }

        // Determinar última actividad registrada
        let ultimaActividad = {
          tipo: 'NINGUNA',
          hora: '--:--',
          horaIso: null,
          descripcion: 'Sin actividad reciente',
          lugar: null
        };

        // Buscar el evento más reciente entre visitas y jornada
        let eventos = [];
        uVisitas.forEach(v => {
          if (v.checkOutHora) {
            eventos.push({
              fecha: new Date(v.checkOutHora),
              tipo: 'SALIDA',
              lugar: v.resultadoResumen || 'Cliente',
              descripcion: `Salida de ${v.resultadoResumen || 'Cliente'}`
            });
          }
          if (v.checkInHora) {
            eventos.push({
              fecha: new Date(v.checkInHora),
              tipo: 'LLEGADA',
              lugar: v.resultadoResumen || 'Cliente',
              descripcion: `Llegada a ${v.resultadoResumen || 'Cliente'}`
            });
          }
        });

        if (j?.horaInicio) {
          eventos.push({
            fecha: new Date(j.horaInicio),
            tipo: 'INICIO_TURNO',
            lugar: 'Punto de partida',
            descripcion: 'Inicio de Jornada en Campo'
          });
        }
        if (j?.horaFin) {
          eventos.push({
            fecha: new Date(j.horaFin),
            tipo: 'FIN_TURNO',
            lugar: 'Fin de jornada',
            descripcion: 'Finalización de Jornada'
          });
        }

        eventos.sort((a, b) => b.fecha - a.fecha);

        if (eventos.length > 0) {
          const ult = eventos[0];
          ultimaActividad = {
            tipo: ult.tipo,
            hora: formatHoraColombia(ult.fecha),
            horaIso: ult.fecha.toISOString(),
            descripcion: ult.descripcion,
            lugar: ult.lugar
          };
        }

        // Tiempos y totales (incluyendo tiempo real de traslado entre paradas)
        let tiempoTotalMin = 0;
        let tiempoTransitoAsesorMin = 0;
        let prevCheckOut = null;

        const movimientosCronologicos = uVisitas.map((item, idx) => {
          let durMin = item.duracionMin || 0;
          if (item.checkInHora && !item.checkOutHora) {
            durMin = Math.max(1, Math.round((ahora - new Date(item.checkInHora)) / 60000));
          }
          tiempoTotalMin += durMin;

          let tiempoTransitoAntesMin = 0;
          if (item.checkInHora && prevCheckOut) {
            const diffTr = Math.round((new Date(item.checkInHora) - new Date(prevCheckOut)) / 60000);
            if (diffTr > 0 && diffTr < 480) {
              tiempoTransitoAntesMin = diffTr;
              tiempoTransitoAsesorMin += diffTr;
            }
          }
          if (item.checkOutHora) {
            prevCheckOut = item.checkOutHora;
          }

          const lugarNombre = item.resultadoResumen || item.clienteExterno?.nombre || item.cliente?.nom || item.prospecto?.nombreComercial || 'Punto de Ruta';
          let direccionLugar = item.clienteExterno?.direccion || item.cliente?.dir || item.prospecto?.direccion || '';
          if (!direccionLugar && item.observaciones && item.observaciones.includes('(') && item.observaciones.includes(')')) {
            const match = item.observaciones.match(/\((.*?)\)/);
            if (match && match[1]) direccionLugar = match[1];
          }

          const rawDate = item.checkInHora || item.fechaProgramada || item.createdAt;
          const fechaCol = rawDate ? getFechaColombia(new Date(rawDate)) : getFechaColombia();
          const tieneGpsReal = item.checkInLat !== null && item.checkInLat !== undefined && item.checkInLng !== null && item.checkInLng !== undefined;

          return {
            id: item.id,
            codigo: item.codigo || `MOV-${idx + 1}`,
            numeroParada: idx + 1,
            paradaNumero: idx + 1,
            fecha: fechaCol,
            fechaIso: rawDate,
            horaLlegada: item.checkInHora ? formatHoraColombia(item.checkInHora) : (item.horaEstimada ? `Prog: ${item.horaEstimada}` : '--:--'),
            horaLlegadaIso: item.checkInHora,
            horaSalida: item.checkOutHora ? formatHoraColombia(item.checkOutHora) : (item.checkInHora ? 'En el Lugar' : 'Programada'),
            horaSalidaIso: item.checkOutHora,
            clienteVisitado: lugarNombre,
            lugar: lugarNombre,
            direccion: direccionLugar,
            clienteExternoId: item.clienteExternoId || null,
            clienteId: item.clienteId || null,
            checkInLat: item.checkInLat,
            checkInLng: item.checkInLng,
            checkOutLat: item.checkOutLat,
            checkOutLng: item.checkOutLng,
            checkInHora: item.checkInHora,
            checkOutHora: item.checkOutHora,
            coordenadas: tieneGpsReal ? {
              lat: item.checkInLat,
              lng: item.checkInLng
            } : null,
            duracionMin: durMin,
            tiempoPermanenciaMin: durMin,
            tiempoPermanenciaFormateado: durMin >= 60 ? `${Math.floor(durMin / 60)}h ${durMin % 60}m` : `${durMin} min`,
            tiempoTransitoAntesMin,
            tiempoTransitoAntesTexto: tiempoTransitoAntesMin > 0 ? `${tiempoTransitoAntesMin} min en traslado` : null,
            observaciones: item.observaciones || '',
            actividadesRealizadas: item.actividadesRealizadas || '',
            resultado: item.resultadoVisita || (item.checkOutHora ? 'Completada' : (item.checkInHora ? 'En Curso' : 'Programada')),
            resultadoVisita: item.resultadoVisita || (item.checkOutHora ? 'Completada' : (item.checkInHora ? 'En Curso' : 'Programada')),
            firmaCliente: item.firmaCliente || null,
            fotografias: Array.isArray(item.evidencias) ? item.evidencias : [],
            evidencias: Array.isArray(item.evidencias) ? item.evidencias : [],
            geolocalizacion: {
              lat: item.checkInLat,
              lng: item.checkInLng,
              precision: item.checkInPrecision || null,
              disponible: tieneGpsReal
            },
            estado: item.checkOutHora ? 'Realizada' : (item.checkInHora ? 'En el Lugar' : (item.estado || 'Programada')),
            motivo: item.tipoVisita || 'Visita Comercial',
            tipoVisita: item.tipoVisita || 'Visita Comercial',
            contacto: item.contactoAtendio || item.clienteExterno?.contacto || '',
            telefonoContacto: item.clienteExterno?.telefono || item.cliente?.tel || ''
          };
        });

        const horasTotal = Math.floor(tiempoTotalMin / 60);
        const minsTotal = tiempoTotalMin % 60;
        const tiempoEnCampoFormateado = horasTotal > 0 ? `${horasTotal} h ${minsTotal} min` : `${minsTotal} min`;

        return {
          id: u.id,
          nombre: `${u.nombre} ${u.apellido || ''}`.trim(),
          usuario: u.user,
          user: u.user,
          cargo: u.cargo || 'Asesor Comercial',
          foto: u.foto || null,
          telefono: u.telefono || null,
          correo: u.correo || null,
          estado,
          estadoAsesor: estado,
          estadoColor,
          estadoAsesorColor: estadoColor,
          ultimaActividad: ultimaActividad.descripcion,
          ultimaActividadHora: ultimaActividad.hora,
          ultimaActividadObj: ultimaActividad,
          totalVisitas: uVisitas.length,
          visitasCompletadas: uVisitas.filter(v => v.checkOutHora).length,
          visitasEnCurso: paradaEnCurso ? 1 : 0,
          tiempoEnCampoMinutos: tiempoTotalMin,
          tiempoEnCampoMin: tiempoTotalMin,
          tiempoEnCampoFormateado,
          tiempoEnCampoTexto: tiempoEnCampoFormateado,
          tiempoTransitoMin: tiempoTransitoAsesorMin,
          tiempoTransitoFormateado: tiempoTransitoAsesorMin >= 60 ? `${Math.floor(tiempoTransitoAsesorMin / 60)}h ${tiempoTransitoAsesorMin % 60}m` : `${tiempoTransitoAsesorMin} min`,
          jornadaId: j?.id || null,
          horaInicioJornada: j?.horaInicio ? formatHoraColombia(j.horaInicio) : null,
          horaFinJornada: j?.horaFin ? formatHoraColombia(j.horaFin) : null,
          paradaActiva: paradaEnCurso ? {
            id: paradaEnCurso.id,
            lugar: paradaEnCurso.resultadoResumen,
            checkInHora: paradaEnCurso.checkInHora,
            horaLlegada: formatHoraColombia(paradaEnCurso.checkInHora),
            motivo: paradaEnCurso.tipoVisita
          } : null,
          movimientoActivo: paradaEnCurso ? {
            id: paradaEnCurso.id,
            lugar: paradaEnCurso.resultadoResumen,
            resultadoResumen: paradaEnCurso.resultadoResumen,
            checkInHora: paradaEnCurso.checkInHora,
            horaLlegada: formatHoraColombia(paradaEnCurso.checkInHora),
            tipoVisita: paradaEnCurso.tipoVisita,
            motivo: paradaEnCurso.tipoVisita
          } : null,
          trazabilidad: movimientosCronologicos,
          movimientos: movimientosCronologicos
        };
      });

      // Si hay término de búsqueda, filtrar asesores
      let asesoresResultado = asesoresPaneles;
      if (busqueda && String(busqueda).trim()) {
        const q = String(busqueda).trim().toLowerCase();
        asesoresResultado = asesoresPaneles.filter(a => {
          const matchAsesor = a.nombre.toLowerCase().includes(q) || a.user.toLowerCase().includes(q) || a.cargo.toLowerCase().includes(q);
          const matchVisitas = a.trazabilidad.some(t =>
            t.clienteVisitado.toLowerCase().includes(q) ||
            t.direccion.toLowerCase().includes(q) ||
            t.observaciones.toLowerCase().includes(q) ||
            t.actividadesRealizadas.toLowerCase().includes(q)
          );
          return matchAsesor || matchVisitas;
        });
      }

      // Métricas globales para el Delegado
      const totalAsesores = asesoresResultado.length;
      const enRutaCount = asesoresResultado.filter(a => a.estado === 'En ruta').length;
      const visitandoCount = asesoresResultado.filter(a => a.estado === 'Visitando Cliente').length;
      const finalizadasCount = asesoresResultado.filter(a => a.estado === 'Finalizada').length;
      const totalVisitasGlobal = asesoresResultado.reduce((acc, a) => acc + a.totalVisitas, 0);
      const tiempoGlobalMin = asesoresResultado.reduce((acc, a) => acc + a.tiempoEnCampoMinutos, 0);
      const promedioMinPorParada = totalVisitasGlobal > 0 ? Math.round(tiempoGlobalMin / totalVisitasGlobal) : 0;
      const tiempoTotalTexto = `${Math.floor(tiempoGlobalMin / 60)}h ${tiempoGlobalMin % 60}m`;

      res.json({
        success: true,
        fecha: fechaStr,
        metricasGlobales: {
          totalAsesores,
          enRuta: enRutaCount,
          visitandoCliente: visitandoCount,
          finalizadas: finalizadasCount,
          totalVisitas: totalVisitasGlobal,
          tiempoTotalMinutos: tiempoGlobalMin,
          tiempoTotalFormateado: tiempoTotalTexto,
          tiempoTotalTexto,
          promedioMinutosPorParada: promedioMinPorParada
        },
        resumenGlobal: {
          totalAsesores,
          asesoresEnRuta: enRutaCount,
          asesoresVisitando: visitandoCount,
          totalVisitas: totalVisitasGlobal,
          tiempoTotalMin: tiempoGlobalMin,
          tiempoTotalTexto,
          tiempoPromedioPorVisitaMin: promedioMinPorParada
        },
        asesores: asesoresResultado
      });
    } catch (err) {
      console.error('[getPanelGerencialMovimientos Error]', err);
      res.status(500).json({ error: err.message });
    }
  }

  async getMovimientosDia(req, res) {
    try {
      await autoCerrarJornadasVencidas(prisma);

      const { fecha, periodo, usuarioId, desde, hasta } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? (usuarioId && usuarioId !== 'TODOS' ? usuarioId : null) : req.user.id;

      const ahora = new Date();
      const hoyColombia = getFechaColombia(ahora);

      let dataPresencia = null;
      try {
        dataPresencia = await auditoriaService.obtenerSesionesActivas(ahora);
      } catch (ePres) {}
      const presenciaMap = new Map();
      (dataPresencia?.usuarios || []).forEach(p => {
        presenciaMap.set(String(p.id), p);
      });

      const where = {};
      if (targetUserId) {
        where.usuarioId = targetUserId;
      }

      // Periodo o rango inteligente
      let modoPeriodo = (periodo || '').toLowerCase();
      let fechaStr = fecha || 'TODOS';

      if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha !== 'TODOS' && !modoPeriodo) {
        modoPeriodo = 'dia';
      } else if (!modoPeriodo && (!fecha || fecha === 'TODOS' || fecha === 'ALL')) {
        modoPeriodo = 'todos';
      }

      if (modoPeriodo === 'hoy') {
        const startOfDay = new Date(`${hoyColombia}T00:00:00-05:00`);
        const endOfDay = new Date(`${hoyColombia}T23:59:59.999-05:00`);
        where.checkInHora = { gte: startOfDay, lte: endOfDay };
        fechaStr = hoyColombia;
      } else if (modoPeriodo === 'semana') {
        const sevenDaysAgo = new Date(ahora.getTime() - 7 * 24 * 3600 * 1000);
        const startStr = getFechaColombia(sevenDaysAgo);
        const startOfDay = new Date(`${startStr}T00:00:00-05:00`);
        where.checkInHora = { gte: startOfDay };
        fechaStr = 'SEMANA_ACTUAL';
      } else if (modoPeriodo === 'mes') {
        const thirtyDaysAgo = new Date(ahora.getTime() - 30 * 24 * 3600 * 1000);
        const startStr = getFechaColombia(thirtyDaysAgo);
        const startOfDay = new Date(`${startStr}T00:00:00-05:00`);
        where.checkInHora = { gte: startOfDay };
        fechaStr = 'MES_ACTUAL';
      } else if (modoPeriodo === 'rango' && desde && hasta) {
        const startOfDay = new Date(`${desde}T00:00:00-05:00`);
        const endOfDay = new Date(`${hasta}T23:59:59.999-05:00`);
        where.checkInHora = { gte: startOfDay, lte: endOfDay };
        fechaStr = `${desde} a ${hasta}`;
      } else if (modoPeriodo === 'dia' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const startOfDay = new Date(`${fecha}T00:00:00-05:00`);
        const endOfDay = new Date(`${fecha}T23:59:59.999-05:00`);
        where.checkInHora = { gte: startOfDay, lte: endOfDay };
        fechaStr = fecha;
      } else {
        modoPeriodo = 'todos';
        fechaStr = 'TODOS';
        where.checkInHora = { not: null };
      }

      // 1. Obtener la lista estricta de Operadores en Campo (nunca Delegados de Gerencia ni Administradores)
      const usuariosCampo = await prisma.user.findMany({
        where: this.getFiltroOperadoresCampo(),
        select: {
          id: true,
          nombre: true,
          apellido: true,
          user: true,
          cargo: true,
          foto: true,
          telefono: true,
          isOnline: true,
          lat: true,
          lng: true,
          lastLocationUpdate: true,
          esComercialCampo: true,
          esDelegadoGerencia: true
        },
        orderBy: { nombre: 'asc' }
      });

      const usuariosCampoIds = usuariosCampo.map(u => u.id);
      if (!targetUserId) {
        where.usuarioId = { in: usuariosCampoIds };
      }

      // 2. Obtener todas las visitas en el filtro
      const items = await prisma.visitaCampo.findMany({
        where,
        include: {
          usuario: {
            select: { id: true, nombre: true, apellido: true, user: true, cargo: true, foto: true, telefono: true, isOnline: true }
          },
          cliente: true,
          clienteExterno: true,
          prospecto: true
        },
        orderBy: [
          { checkInHora: 'asc' },
          { createdAt: 'asc' }
        ]
      });

      // 3. Asignar un color fijo/determinístico a cada operador
      const advisorColorMap = {};
      usuariosCampo.forEach((u, i) => {
        advisorColorMap[u.id] = i % 8;
      });

      // 4. Obtener jornadas de campo activas o recientes de hoy y últimos pings GPS
      const { startOfDay: startOfToday, endOfDay: endOfToday } = getColombiaDayBounds(ahora);
      const [jornadas, ultimosPings] = await Promise.all([
        prisma.jornadaLaboral.findMany({
          where: {
            usuarioId: targetUserId ? targetUserId : { in: usuariosCampoIds },
            horaInicio: { gte: startOfToday, lte: endOfToday }
          },
          orderBy: { horaInicio: 'desc' },
          take: 50
        }),
        prisma.rastreoUbicacion.findMany({
          where: {
            usuarioId: { in: usuariosCampoIds }
          },
          orderBy: { timestamp: 'desc' },
          take: 100
        })
      ]);
      const jornadasPorUsuario = new Map();
      jornadas.forEach(j => {
        if (!jornadasPorUsuario.has(j.usuarioId)) {
          jornadasPorUsuario.set(j.usuarioId, j);
        }
      });
      const pingPorUsuario = new Map();
      ultimosPings.forEach(p => {
        if (!pingPorUsuario.has(p.usuarioId)) {
          pingPorUsuario.set(p.usuarioId, p);
        }
      });

      // 5. Procesamiento y Detección de Anomalías
      const paradasPorUsuarioYFecha = {};
      const ultimoCheckOutPorUsuario = {};
      const clientesUnicosSet = new Set();
      const anomaliasGlobales = [];
      let tiempoEfectivoTotalMin = 0;
      let tiempoTransitoEstimadoMin = 0;

      const movimientos = items.map((item, index) => {
        const uId = item.usuarioId;
        const rawDate = item.checkInHora || item.fechaProgramada || item.createdAt;
        const fechaCol = rawDate ? getFechaColombia(new Date(rawDate)) : hoyColombia;

        const keyGrupo = `${uId}_${fechaCol}`;
        if (!paradasPorUsuarioYFecha[keyGrupo]) paradasPorUsuarioYFecha[keyGrupo] = 0;
        paradasPorUsuarioYFecha[keyGrupo] += 1;
        const paradaNum = paradasPorUsuarioYFecha[keyGrupo];

        let duracionMin = Math.min(480, Math.max(0, item.duracionMin || 0));
        if (item.checkInHora && !item.checkOutHora) {
          const rawOpenMin = Math.max(1, Math.round((ahora - new Date(item.checkInHora)) / 60000));
          duracionMin = Math.min(240, rawOpenMin);
        }
        tiempoEfectivoTotalMin += duracionMin;

        const lugarNombre = item.resultadoResumen || item.clienteExterno?.nombre || item.cliente?.nom || item.prospecto?.nombreComercial || 'Punto de Ruta';
        if (lugarNombre) clientesUnicosSet.add(lugarNombre.trim().toLowerCase());

        let direccionLugar = item.clienteExterno?.direccion || item.cliente?.dir || item.prospecto?.direccion || '';
        if (!direccionLugar && item.observaciones && item.observaciones.includes('(') && item.observaciones.includes(')')) {
          const match = item.observaciones.match(/\((.*?)\)/);
          if (match && match[1]) direccionLugar = match[1];
        }

        const nombreAsesor = `${item.usuario?.nombre || ''} ${item.usuario?.apellido || ''}`.trim() || item.usuario?.user || 'Asesor';

        // --- VERIFICACIÓN DE PARADAS ABIERTAS SIN SALIDA E INTERVALOS DE TRÁNSITO ---
        const anomaliasParada = [];

        if (item.checkInHora && !item.checkOutHora && duracionMin >= 180) {
          anomaliasParada.push({
            tipo: 'CHECKIN_SIN_SALIDA',
            label: 'Check-In Abierto sin Salida',
            motivo: `Visita iniciada sin registro de salida (>3h).`,
            severidad: 'danger'
          });
        }

        let tiempoTransitoAntesMin = 0;
        if (item.checkInHora && ultimoCheckOutPorUsuario[keyGrupo]) {
          const minutosDesdeUltimaSalida = Math.round((new Date(item.checkInHora) - new Date(ultimoCheckOutPorUsuario[keyGrupo])) / 60000);
          if (minutosDesdeUltimaSalida > 0 && minutosDesdeUltimaSalida <= 240) {
            tiempoTransitoAntesMin = minutosDesdeUltimaSalida;
            tiempoTransitoEstimadoMin += minutosDesdeUltimaSalida;
          }
        }

        // Actualizar último checkout para la siguiente comparación
        if (item.checkOutHora) {
          ultimoCheckOutPorUsuario[keyGrupo] = item.checkOutHora;
        }

        const esSospechosa = anomaliasParada.length > 0;
        const esJustificada = !esSospechosa && (Boolean(item.actividadesRealizadas) || Boolean(item.observaciones) || (Array.isArray(item.evidencias) && item.evidencias.length > 0));

        if (esSospechosa) {
          anomaliasGlobales.push({
            movimientoId: item.id,
            codigo: item.codigo || `MOV-${index + 1}`,
            asesor: nombreAsesor,
            usuarioId: uId,
            lugar: lugarNombre,
            fecha: fechaCol,
            hora: item.checkInHora ? formatHoraColombia(item.checkInHora) : '--:--',
            anomalias: anomaliasParada
          });
        }

        const colorIdx = advisorColorMap[uId] !== undefined ? advisorColorMap[uId] : 0;

        return {
          id: item.id,
          codigo: item.codigo || `MOV-${index + 1}`,
          fecha: fechaCol,
          fechaIso: rawDate,
          paradaNumero: paradaNum,
          numeroParada: paradaNum,
          usuarioId: item.usuarioId,
          usuarioNombre: nombreAsesor,
          asesorNombre: nombreAsesor,
          usuarioCargo: item.usuario?.cargo || 'Asesor Comercial',
          usuarioFoto: item.usuario?.foto || null,
          usuarioTelefono: item.usuario?.telefono || null,
          colorIndex: colorIdx,
          lugar: lugarNombre,
          direccion: direccionLugar,
          motivo: item.tipoVisita || 'Visita Comercial',
          contacto: item.contactoAtendio || item.clienteExterno?.contacto || '',
          checkInHora: item.checkInHora,
          checkInLat: item.checkInLat,
          checkInLng: item.checkInLng,
          checkOutHora: item.checkOutHora,
          checkOutLat: item.checkOutLat,
          checkOutLng: item.checkOutLng,
          duracionMin,
          duracionTexto: duracionMin >= 60 ? `${Math.floor(duracionMin / 60)}h ${duracionMin % 60}m` : `${duracionMin} min`,
          tiempoTransitoAntesMin,
          tiempoTransitoAntesTexto: tiempoTransitoAntesMin > 0 ? `${tiempoTransitoAntesMin} min traslado` : null,
          firmaCliente: item.firmaCliente || null,
          estado: item.checkOutHora ? 'Realizada' : (item.checkInHora ? 'En Curso' : (item.estado || 'Pendiente')),
          actividadesRealizadas: item.actividadesRealizadas || '',
          observaciones: item.observaciones || '',
          resultado: item.resultadoVisita || (item.checkOutHora ? 'Completada' : 'En Curso'),
          evidencias: Array.isArray(item.evidencias) ? item.evidencias : [],
          anomalias: anomaliasParada,
          esSospechosa,
          esJustificada,
          clienteExternoId: item.clienteExternoId,
          clienteId: item.clienteId,
          jornadaId: item.jornadaId,
          createdAt: item.createdAt
        };
      });

      // Ordenar movimientos en orden descendente para la visualización cronológica ejecutiva
      const movimientosDesc = [...movimientos].reverse();

      // 6. Directorio Operativo de Asesores con Ficha Ejecutiva
      const asesoresDetalle = usuariosCampo.map(u => {
        const uMovs = movimientos.filter(m => m.usuarioId === u.id);
        const j = jornadasPorUsuario.get(u.id);
        const pres = presenciaMap.get(String(u.id));
        const isOnlineReal = Boolean(pres?.isOnline || (pres?.estadoPresencia === 'EN_LINEA'));
        const paradaActiva = uMovs.find(m => (m.estado === 'En Curso' || (m.checkInHora && !m.checkOutHora)) && m.fecha === hoyColombia);

        let estadoOperativo = 'Sin actividad';
        let estadoColor = 'slate';

        if (paradaActiva) {
          estadoOperativo = 'Visitando Cliente';
          estadoColor = 'amber';
        } else if (j && ['Iniciada', 'En Ruta', 'Activa'].includes(j.estado)) {
          estadoOperativo = 'En ruta';
          estadoColor = 'emerald';
        } else if (j && j.estado === 'En Pausa') {
          estadoOperativo = 'En pausa';
          estadoColor = 'orange';
        } else if (j && j.estado === 'Finalizada') {
          estadoOperativo = 'Finalizada';
          estadoColor = 'slate';
        } else if (isOnlineReal) {
          estadoOperativo = 'Disponible';
          estadoColor = 'blue';
        } else if (uMovs.length > 0) {
          estadoOperativo = 'Finalizada';
          estadoColor = 'slate';
        }

        const tiempoEnCampoMin = uMovs.reduce((acc, m) => acc + (m.duracionMin || 0), 0);
        const completadas = uMovs.filter(m => m.estado === 'Realizada').length;
        const efectividadPct = uMovs.length > 0 ? Math.round((completadas / uMovs.length) * 100) : 0;
        const anomaliasAsesor = anomaliasGlobales.filter(a => a.usuarioId === u.id);

        const ultimaParada = uMovs.length > 0 ? uMovs[uMovs.length - 1] : null;
        const pingGps = pingPorUsuario.get(u.id);

        // Resolver coordenadas en tiempo real del operador (parada activa > último ping / ubicación en vivo del usuario > inicio de turno > última parada)
        let latReal = null;
        let lngReal = null;
        if (paradaActiva?.checkInLat && paradaActiva?.checkInLng) {
          latReal = Number(paradaActiva.checkInLat);
          lngReal = Number(paradaActiva.checkInLng);
        } else if (u.lat != null && u.lng != null) {
          latReal = Number(u.lat);
          lngReal = Number(u.lng);
        } else if (pingGps?.lat != null && pingGps?.lng != null) {
          latReal = Number(pingGps.lat);
          lngReal = Number(pingGps.lng);
        } else if (j?.latInicio != null && j?.lngInicio != null) {
          latReal = Number(j.latInicio);
          lngReal = Number(j.lngInicio);
        } else if (ultimaParada && (ultimaParada.checkInLat || ultimaParada.checkOutLat)) {
          latReal = Number(ultimaParada.checkInLat || ultimaParada.checkOutLat);
          lngReal = Number(ultimaParada.checkInLng || ultimaParada.checkOutLng);
        }

        const coordsObj = (latReal != null && lngReal != null && !isNaN(latReal) && !isNaN(lngReal))
          ? { lat: latReal, lng: lngReal }
          : null;

        let textoUbicacion = 'Sin reporte GPS';
        if (paradaActiva) {
          textoUbicacion = `En visita: ${paradaActiva.lugar}`;
        } else if (ultimaParada) {
          textoUbicacion = `Última parada: ${ultimaParada.lugar}`;
        } else if (coordsObj) {
          textoUbicacion = `GPS en tiempo real (${coordsObj.lat.toFixed(4)}, ${coordsObj.lng.toFixed(4)})`;
        }

        return {
          id: u.id,
          nombre: `${u.nombre} ${u.apellido || ''}`.trim() || u.user,
          user: u.user,
          cargo: u.cargo || 'Operador en Campo',
          foto: u.foto || null,
          telefono: u.telefono || null,
          esComercialCampo: true,
          esDelegadoGerencia: false,
          isOnline: isOnlineReal,
          primerIngreso: pres?.primerIngreso || (j ? j.horaInicio : null),
          colorIndex: advisorColorMap[u.id] !== undefined ? advisorColorMap[u.id] : 0,
          estado: estadoOperativo,
          estadoColor,
          horaInicio: j?.horaInicio ? formatHoraColombia(j.horaInicio) : (uMovs.length > 0 && uMovs[0].checkInHora ? formatHoraColombia(uMovs[0].checkInHora) : '--:--'),
          ubicacionActual: textoUbicacion,
          direccionActual: paradaActiva ? paradaActiva.direccion : (ultimaParada ? ultimaParada.direccion : ''),
          coordenadasActuales: coordsObj,
          lat: coordsObj ? coordsObj.lat : null,
          lng: coordsObj ? coordsObj.lng : null,
          lastLocationUpdate: pingGps?.timestamp || (u.lastLocationUpdate ? new Date(Number(u.lastLocationUpdate)).toISOString() : null),
          totalVisitas: uMovs.length,
          totalParadas: uMovs.length,
          visitasCompletadas: completadas,
          visitasEnCurso: paradaActiva ? 1 : 0,
          tiempoEnCampoMin,
          tiempoEnCampoFormateado: tiempoEnCampoMin >= 60 ? `${Math.floor(tiempoEnCampoMin / 60)}h ${tiempoEnCampoMin % 60}m` : `${tiempoEnCampoMin}m`,
          efectividadPct,
          totalAnomalias: anomaliasAsesor.length,
          paradaActiva: paradaActiva ? { id: paradaActiva.id, lugar: paradaActiva.lugar, horaLlegada: paradaActiva.checkInHora ? formatHoraColombia(paradaActiva.checkInHora) : '--:--' } : null,
          trazabilidad: uMovs
        };
      });

      // 7. Agregados para Gráficas y Evolución Temporal
      // Evolución Diaria
      const diasMap = {};
      movimientos.forEach(m => {
        const dia = m.fecha;
        if (!diasMap[dia]) {
          diasMap[dia] = { fecha: dia, visitas: 0, tiempoEfectivoMin: 0, finalizadas: 0, asesores: new Set() };
        }
        diasMap[dia].visitas += 1;
        diasMap[dia].tiempoEfectivoMin += m.duracionMin || 0;
        if (m.estado === 'Realizada') diasMap[dia].finalizadas += 1;
        diasMap[dia].asesores.add(m.usuarioId);
      });

      const evolucionDiaria = Object.keys(diasMap).sort().map(dia => ({
        fecha: dia,
        visitas: diasMap[dia].visitas,
        finalizadas: diasMap[dia].finalizadas,
        tiempoEfectivoMin: diasMap[dia].tiempoEfectivoMin,
        tiempoEfectivoHoras: Number((diasMap[dia].tiempoEfectivoMin / 60).toFixed(1)),
        asesoresActivos: diasMap[dia].asesores.size
      }));

      // Evolución Mensual
      const mesesMap = {};
      movimientos.forEach(m => {
        const mesKey = m.fecha.substring(0, 7); // YYYY-MM
        if (!mesesMap[mesKey]) {
          mesesMap[mesKey] = { mes: mesKey, visitas: 0, tiempoEfectivoMin: 0 };
        }
        mesesMap[mesKey].visitas += 1;
        mesesMap[mesKey].tiempoEfectivoMin += m.duracionMin || 0;
      });
      const evolucionMensual = Object.keys(mesesMap).sort().map(mes => ({
        mes,
        visitas: mesesMap[mes].visitas,
        tiempoEfectivoMin: mesesMap[mes].tiempoEfectivoMin,
        tiempoEfectivoHoras: Number((mesesMap[mes].tiempoEfectivoMin / 60).toFixed(1))
      }));

      // Productividad por Asesor (con tiempo de tránsito real calculado entre paradas)
      const productividadPorAsesor = asesoresDetalle.map(a => {
        const tiempoHoras = Number((a.tiempoEnCampoMin / 60).toFixed(1));
        let transitoAsesorMin = 0;
        let lastOut = null;
        (a.trazabilidad || []).forEach(m => {
          if (m.checkInHora && lastOut) {
            const diffMin = Math.round((new Date(m.checkInHora) - new Date(lastOut)) / 60000);
            if (diffMin > 0 && diffMin < 480) transitoAsesorMin += diffMin;
          }
          if (m.checkOutHora) lastOut = m.checkOutHora;
        });
        const tiempoTransitoHoras = Number((transitoAsesorMin / 60).toFixed(1));
        const score = (a.totalVisitas * 10) + (a.visitasCompletadas * 5) + Math.min(20, Math.round(a.tiempoEnCampoMin / 30));
        return {
          usuarioId: a.id,
          nombre: a.nombre,
          user: a.user,
          cargo: a.cargo,
          colorIndex: a.colorIndex,
          totalVisitas: a.totalVisitas,
          visitasCompletadas: a.visitasCompletadas,
          tiempoEnCampoMin: a.tiempoEnCampoMin,
          tiempoEnCampoHoras: tiempoHoras,
          tiempoTransitoMin: transitoAsesorMin,
          tiempoTransitoHoras,
          efectividadPct: a.efectividadPct,
          anomaliasCount: a.totalAnomalias,
          score
        };
      }).sort((a, b) => b.score - a.score);

      // 8. Métricas Globales Ejecutivas
      const totalMovimientos = movimientos.length;
      const completados = movimientos.filter(m => m.estado === 'Realizada').length;
      const enCurso = movimientos.filter(m => m.estado === 'En Curso').length;
      const paradasSospechosasCount = movimientos.filter(m => m.esSospechosa).length;
      const paradasJustificadasCount = totalMovimientos - paradasSospechosasCount;
      const cumplimientoRutaPct = totalMovimientos > 0 ? Math.round((completados / totalMovimientos) * 100) : 0;
      const asesoresConActividad = asesoresDetalle.filter(a => a.totalVisitas > 0 || a.estado === 'En ruta' || a.estado === 'Visitando Cliente').length;
      const asesoresSinActividad = Math.max(0, asesoresDetalle.length - asesoresConActividad);

      const metricas = {
        totalVisitas: totalMovimientos,
        totalParadas: totalMovimientos,
        completadas: completados,
        finalizadas: completados,
        enCurso,
        clientesUnicos: clientesUnicosSet.size,
        tiempoEfectivoMin: tiempoEfectivoTotalMin,
        tiempoEfectivoHoras: `${Math.floor(tiempoEfectivoTotalMin / 60)}h ${tiempoEfectivoTotalMin % 60}m`,
        tiempoTransitoEstimadoMin,
        tiempoTransitoHoras: `${Math.floor(tiempoTransitoEstimadoMin / 60)}h ${tiempoTransitoEstimadoMin % 60}m`,
        tiempoImproductivoMin: tiempoTransitoEstimadoMin,
        paradasJustificadas: paradasJustificadasCount,
        paradasSospechosas: paradasSospechosasCount,
        cumplimientoRutaPct,
        asesoresActivos: asesoresConActividad,
        asesoresSinActividad,
        totalAsesores: asesoresDetalle.length,
        totalAnomalias: anomaliasGlobales.length
      };

      res.json({
        success: true,
        periodo: modoPeriodo,
        fecha: fechaStr,
        fechaConsulta: hoyColombia,
        metricas,
        resumen: {
          ...metricas,
          totalMovimientos,
          tiempoTotalMinutos: tiempoEfectivoTotalMin,
          promedioMinutosPorParada: totalMovimientos > 0 ? Math.round(tiempoEfectivoTotalMin / totalMovimientos) : 0
        },
        anomalias: anomaliasGlobales,
        rankingProductividad: productividadPorAsesor,
        productividadPorAsesor,
        evolucionDiaria,
        evolucionMensual,
        asesores: asesoresDetalle,
        movimientos: movimientosDesc
      });
    } catch (err) {
      console.error('[getMovimientosDia Error]', err);
      res.status(500).json({ error: err.message });
    }
  }

  async eliminarMovimiento(req, res) {
    try {
      const { id } = req.params;
      const movimiento = await prisma.visitaCampo.findUnique({ where: { id } });
      if (!movimiento) {
        return res.status(404).json({ error: 'Movimiento o parada no encontrada.' });
      }

      if (!this.esDelegado(req.user) && movimiento.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para eliminar este movimiento.' });
      }

      await prisma.seguimientoCampo.deleteMany({ where: { visitaId: id } }).catch(() => {});
      await prisma.visitaCampo.delete({ where: { id } });

      await this.registrarAuditoria(req.user.id, 'CAMPO_MOVIMIENTO_ELIMINADO', {
        id,
        codigo: movimiento.codigo,
        lugar: movimiento.resultadoResumen
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_MOVIMIENTO_UPDATE', { accion: 'ELIMINAR', id, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_MOVIMIENTO_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Parada eliminada correctamente.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async eliminarMovimientosDia(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar todas las paradas/movimientos del día.' });
      }
      const { fecha, usuarioId } = req.query;
      let fechaStr = fecha;
      if (!fechaStr) {
        fechaStr = getFechaColombia(new Date());
      }
      const startOfDay = new Date(`${fechaStr}T00:00:00-05:00`);
      const endOfDay = new Date(`${fechaStr}T23:59:59.999-05:00`);

      const where = {
        OR: [
          { checkInHora: { gte: startOfDay, lte: endOfDay } },
          { checkInHora: null, fechaProgramada: { gte: startOfDay, lte: endOfDay } }
        ]
      };
      if (usuarioId && usuarioId !== 'TODOS') {
        where.usuarioId = usuarioId;
      }

      const visitas = await prisma.visitaCampo.findMany({ where, select: { id: true } });
      const ids = visitas.map(v => v.id);

      if (ids.length > 0) {
        await prisma.seguimientoCampo.deleteMany({ where: { visitaId: { in: ids } } }).catch(() => {});
        const result = await prisma.visitaCampo.deleteMany({ where: { id: { in: ids } } });

        await this.registrarAuditoria(req.user.id, 'CAMPO_MOVIMIENTOS_DIA_ELIMINADOS', {
          fecha: fechaStr,
          usuarioId: usuarioId || 'TODOS',
          totalEliminados: result.count
        });

        const io = req.app?.get ? req.app.get('io') : null;
        if (io) {
          io.emit('CAMPO_MOVIMIENTO_UPDATE', { accion: 'ELIMINAR_TODOS', fecha: fechaStr, timestamp: Date.now() });
          io.emit('db_update', { type: 'CAMPO_MOVIMIENTO_UPDATE', timestamp: Date.now() });
        }

        return res.json({ success: true, count: result.count, message: `Se eliminaron ${result.count} paradas de la fecha ${fechaStr}.` });
      }

      res.json({ success: true, count: 0, message: 'No hay paradas registradas para la fecha seleccionada.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async eliminarVisita(req, res) {
    try {
      const { id } = req.params;
      const visita = await prisma.visitaCampo.findUnique({ where: { id } });
      if (!visita) {
        return res.status(404).json({ error: 'Visita no encontrada.' });
      }

      if (!this.esDelegado(req.user) && visita.usuarioId !== req.user.id) {
        return res.status(403).json({ error: 'No autorizado para eliminar esta visita.' });
      }

      await prisma.seguimientoCampo.deleteMany({ where: { visitaId: id } }).catch(() => {});
      await prisma.visitaCampo.delete({ where: { id } });

      await this.registrarAuditoria(req.user.id, 'CAMPO_VISITA_ELIMINADA', {
        id,
        codigo: visita.codigo
      });

      const io = req.app?.get ? req.app.get('io') : null;
      if (io) {
        io.emit('CAMPO_VISITA_UPDATE', { accion: 'ELIMINAR', id, timestamp: Date.now() });
        io.emit('CAMPO_MOVIMIENTO_UPDATE', { accion: 'ELIMINAR', id, timestamp: Date.now() });
        io.emit('db_update', { type: 'CAMPO_VISITA_UPDATE', timestamp: Date.now() });
      }

      res.json({ success: true, message: 'Visita eliminada correctamente.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async eliminarTodasVisitas(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede eliminar todas las visitas.' });
      }
      const { usuarioId } = req.query;
      const where = {};
      if (usuarioId && usuarioId !== 'TODOS') {
        where.usuarioId = usuarioId;
      }

      const visitas = await prisma.visitaCampo.findMany({ where, select: { id: true } });
      const ids = visitas.map(v => v.id);

      if (ids.length > 0) {
        await prisma.seguimientoCampo.deleteMany({ where: { visitaId: { in: ids } } }).catch(() => {});
        const result = await prisma.visitaCampo.deleteMany({ where: { id: { in: ids } } });

        await this.registrarAuditoria(req.user.id, 'CAMPO_TODAS_VISITAS_ELIMINADAS', {
          totalEliminadas: result.count,
          usuarioFiltro: usuarioId || 'TODOS'
        });

        const io = req.app?.get ? req.app.get('io') : null;
        if (io) {
          io.emit('CAMPO_VISITA_UPDATE', { accion: 'ELIMINAR_TODAS', timestamp: Date.now() });
          io.emit('db_update', { type: 'CAMPO_VISITA_UPDATE', timestamp: Date.now() });
        }

        return res.json({ success: true, count: result.count, message: `Se eliminaron ${result.count} visitas correctamente.` });
      }

      res.json({ success: true, count: 0, message: 'No hay visitas para eliminar.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new CampoController();
