const prisma = require('../prisma');
const jornadaService = require('../services/campo/jornada.service');
const trackingService = require('../services/campo/tracking.service');
const visitasService = require('../services/campo/visitas.service');
const productividadService = require('../services/campo/productividad.service');
const actividadesService = require('../services/campo/actividades.service');
const evidenciasService = require('../services/campo/evidencias.service');
const reportesService = require('../services/campo/reportes.service');
const evaluacionesCampoService = require('../services/campo/evaluacionesCampo.service');
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

class CampoController {
  // Helper de permisos del Delegado de Gerencia
  esDelegado(user) {
    if (!user) return false;
    return String(user.roleId) === '1' || user.user?.toLowerCase() === 'admin' || Boolean(user.esDelegadoGerencia);
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

  // --- JORNADA ---
  async iniciarJornada(req, res) {
    try {
      const parsed = iniciarJornadaSchema.parse(req.body);
      const result = await jornadaService.iniciarJornada(req.user.id, parsed);
      if (!result.success) {
        return res.status(400).json(result);
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_INICIO', {
        jornadaId: result.jornada.id,
        lat: parsed.lat,
        lng: parsed.lng
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async iniciarPausa(req, res) {
    try {
      const parsed = pausaJornadaSchema.parse(req.body);
      const result = await jornadaService.iniciarPausa(req.user.id, parsed);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_PAUSA', parsed);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async reanudarPausa(req, res) {
    try {
      const parsed = reanudarJornadaSchema.parse(req.body);
      const result = await jornadaService.reanudarPausa(req.user.id, parsed);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_REANUDAR', parsed);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async finalizarJornada(req, res) {
    try {
      const parsed = finalizarJornadaSchema.parse(req.body);
      const result = await jornadaService.finalizarJornada(req.user.id, parsed);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_JORNADA_FIN', {
        jornadaId: parsed.jornadaId,
        tiempoTotalMin: result.jornada.tiempoTotalMin,
        distanciaKm: result.jornada.distanciaKm
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
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
      res.json(ubicaciones);
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

      res.json({ success: true, visita });
    } catch (err) {
      res.status(400).json({ error: err.errors ? err.errors[0]?.message : err.message });
    }
  }

  async getAgenda(req, res) {
    try {
      const { fecha } = req.query;
      const visitas = await visitasService.getAgendaUsuario(req.user.id, fecha);
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
      const io = req.app?.get('io');
      const result = await visitasService.checkOut(req.user.id, parsed, io);
      if (!result.success) return res.status(400).json(result);

      await this.registrarAuditoria(req.user.id, 'CAMPO_VISITA_CHECKOUT', {
        visitaId: parsed.visitaId,
        duracionMin: result.visita.duracionMin
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
      const result = await actividadesService.listarActividades(req.user.id, req.query, req.user.role);
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

      res.json(result);
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
      const result = await evidenciasService.listarEvidencias(req.user.id, req.query, req.user.role);
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
      const result = await evidenciasService.listarSeguimientos(req.user.id, req.query, req.user.role);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 8. REPORTES OPERATIVOS CONSOLIDADOS ---
  async getReportes(req, res) {
    try {
      const result = await reportesService.generarReporte(req.user.id, req.query, req.user.role);
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

      const evaluacion = await evaluacionesCampoService.guardarEvaluacion(req.user.id, req.body);

      await this.registrarAuditoria(req.user.id, 'CAMPO_EVALUACION_EMITIDA', {
        evaluacionId: evaluacion.id,
        usuarioEvaluadoId: req.body.usuarioId,
        periodo: evaluacion.periodo,
        calificacionGeneral: evaluacion.calificacionGeneral,
        estadoCumplimiento: evaluacion.estadoCumplimiento
      }, {
        evaluadorNombre: `${req.user.nombre} ${req.user.apellido}`,
        accion: 'Calificación y Aprobación de Indicadores'
      }, req);

      res.json({ success: true, evaluacion });
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

  async getComercialesEnCampo(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido al Delegado de Gerencia.' });
      }

      const comerciales = await prisma.user.findMany({
        where: {
          OR: [
            { esComercialCampo: true },
            { roleId: { in: ['67', '68', '69'] } },
            { cargo: { contains: 'comercial', mode: 'insensitive' } },
            { cargo: { contains: 'asesor', mode: 'insensitive' } },
            { cargo: { contains: 'coordinador', mode: 'insensitive' } },
            { cargo: { contains: 'director', mode: 'insensitive' } }
          ],
          AND: [
            { NOT: { roleId: '1' } },
            { NOT: { esDelegadoGerencia: true } }
          ]
        },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          user: true,
          cargo: true,
          roleId: true,
          codigoAsesor: true,
          foto: true,
          meta_p: true,
          meta_u: true,
          esComercialCampo: true,
          role: { select: { id: true, name: true } }
        },
        orderBy: { nombre: 'asc' }
      });

      res.json(comerciales);
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
}

module.exports = new CampoController();
