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
  // Helper de permisos del Delegado de Gerencia (estrictamente por atributo del usuario o Master Admin)
  esDelegado(user) {
    if (!user) return false;
    // Atributo explícito asignado al usuario desde Administración de Usuarios
    if (user.esDelegadoGerencia === true || user.esDelegadoGerencia === 'true') return true;
    // Administrador principal raíz
    if (String(user.roleId) === '1' || user.user?.toLowerCase() === 'admin') return true;
    const cargo = String(user.cargo || '').toLowerCase();
    const roleName = String(user.role?.name || user.roleName || user.role || '').toLowerCase();
    const roleId = String(user.roleId || '');
    if (roleId === '67' || cargo.includes('gerent') || cargo.includes('director') || cargo.includes('directora') || cargo.includes('delegad') ||
        roleName.includes('admin') || roleName.includes('gerent') || roleName.includes('director') || roleName.includes('delegad')) {
      return true;
    }
    return false;
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

      const usuarioIdEvaluado = req.body.usuarioId || req.body.comercialId;
      if (!usuarioIdEvaluado) {
        return res.status(400).json({ error: 'Debe especificar el usuario a evaluar (usuarioId o comercialId).' });
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

  async getComercialesEnCampo(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Acceso restringido al Delegado de Gerencia.' });
      }

      const comerciales = await prisma.user.findMany({
        where: {
          esComercialCampo: true,
          NOT: {
            esDelegadoGerencia: true
          }
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
          telefono: true,
          correo: true,
          meta_p: true,
          meta_u: true,
          esComercialCampo: true,
          esDelegadoGerencia: true,
          lat: true,
          lng: true,
          lastLocationUpdate: true,
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

      res.json({ success: true, seguimiento: nuevoSeguimiento });
    } catch (err) {
      res.status(400).json({ error: err.message });
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
      if (fechaProgramada !== undefined) updateData.fechaProgramada = new Date(fechaProgramada);
      if (horaEstimada !== undefined) updateData.horaEstimada = horaEstimada;
      if (estado !== undefined) {
        updateData.estado = estado;
        if (estado === 'Finalizada') updateData.fechaFinalizacion = new Date();
      }
      if (usuarioId !== undefined && esAdminODelegado) {
        updateData.usuarioId = usuarioId;
      }

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

      res.json({ success: true, actividad: actividadActualizada });
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
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
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

      const fechaObj = new Date(fechaFinal);
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
              usuario: `${req.user.nombre} ${req.user.apellido}`,
              texto: `Ruta programada por el Delegado de Gerencia.`
            }
          ]
        }
      });

      // 2. Programar las visitas asociadas a la ruta si se seleccionaron clientes
      const visitasCreadas = [];
      if (Array.isArray(clientesIds) && clientesIds.length > 0) {
        for (let i = 0; i < clientesIds.length; i++) {
          const clienteId = clientesIds[i];
          const countVis = await prisma.visitaCampo.count();
          const codigoVis = `VIS-${String(countVis + 1).padStart(5, '0')}`;

          const horaEstimadaMin = 8 * 60 + i * 60; // 08:00 AM + 1h por parada
          const h = Math.floor(horaEstimadaMin / 60);
          const m = horaEstimadaMin % 60;
          const horaEstimadaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

          const vis = await prisma.visitaCampo.create({
            data: {
              codigo: codigoVis,
              usuarioId,
              clienteId,
              tipoVisita: 'Comercial Prospeccion',
              estado: 'Programada',
              fechaProgramada: fechaObj,
              horaEstimada: horaEstimadaStr,
              compromisos: `Parada #${i + 1} de la ruta: ${nombreRuta || 'Asignada'}. ${detalleTexto}`
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
        const fechaTexto = fechaFinal ? new Date(fechaFinal).toISOString().split('T')[0] : 'próximamente';
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

      res.json(rutas);
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
        updateData.fechaProgramada = new Date(nuevaFecha);
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
      const fechaConsulta = fecha || new Date().toISOString().split('T')[0];

      const startOfDay = new Date(`${fechaConsulta}T00:00:00.000Z`);
      const endOfDay = new Date(`${fechaConsulta}T23:59:59.999Z`);

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
        const clienteNom = v.cliente?.nom || v.prospecto?.nombreComercial || 'Cliente';
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

      const ahora = new Date();
      const startOfDay = new Date(ahora);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(ahora);
      endOfDay.setHours(23, 59, 59, 999);

      // 1. Obtener todos los comerciales de campo (estrictamente por atributo esComercialCampo)
      const comerciales = await prisma.user.findMany({
        where: {
          esComercialCampo: true,
          NOT: {
            esDelegadoGerencia: true
          }
        },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          cargo: true,
          user: true,
          telefono: true,
          correo: true,
          foto: true,
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

      // 2. Todas las jornadas del día (activas y finalizadas)
      const todasJornadasHoy = await prisma.jornadaLaboral.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          fecha: { gte: startOfDay, lte: endOfDay }
        },
        orderBy: { id: 'desc' }
      });

      const jornadasActivasPorUsuario = new Map();
      const ultimaJornadaPorUsuario = new Map();
      todasJornadasHoy.forEach(j => {
        if (!ultimaJornadaPorUsuario.has(j.usuarioId)) {
          ultimaJornadaPorUsuario.set(j.usuarioId, j);
        }
        if (['Iniciada', 'En Pausa'].includes(j.estado) && !jornadasActivasPorUsuario.has(j.usuarioId)) {
          jornadasActivasPorUsuario.set(j.usuarioId, j);
        }
      });

      // 3. Visitas del día
      const visitasHoy = await prisma.visitaCampo.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          fechaProgramada: { gte: startOfDay, lte: endOfDay }
        },
        include: { cliente: true, prospecto: true, clienteExterno: true }
      });

      const visitasEnCursoPorUsuario = new Map();
      visitasHoy.filter(v => v.estado === 'En Curso').forEach(v => {
        visitasEnCursoPorUsuario.set(v.usuarioId, v);
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
        if (!pingPorUsuario.has(p.usuarioId)) {
          pingPorUsuario.set(p.usuarioId, p);
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
        const jActiva = jornadasActivasPorUsuario.get(c.id);
        const jUltima = ultimaJornadaPorUsuario.get(c.id);
        const vEnCurso = visitasEnCursoPorUsuario.get(c.id);
        const pingGps = pingPorUsuario.get(c.id);

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
            estado = 'Disponible';
            disponible = true;
            disponiblesCount++;
          }
        } else if (jUltima?.estado === 'Finalizada') {
          estadoOperativo = 'finalizada';
          estado = 'Jornada finalizada';
        }

        // Ubicación
        let latVal = c.lat || pingGps?.lat;
        let lngVal = c.lng || pingGps?.lng;
        let updateTime = c.lastLocationUpdate || pingGps?.timestamp;
        let ultimaUbicacion = 'Sin reporte GPS';
        if (latVal && lngVal) {
          const horaGps = updateTime ? ` (${formatHora(updateTime)})` : '';
          ultimaUbicacion = `Lat: ${Number(latVal).toFixed(4)}, Lng: ${Number(lngVal).toFixed(4)}${horaGps}`;
        }

        // Jornada horas
        const jornadaIniciada = jUltima?.horaInicio ? formatHora(jUltima.horaInicio) : '--';
        const jornadaFinalizada = jUltima?.horaFin ? formatHora(jUltima.horaFin) : (jActiva ? 'En curso' : '--');
        const visitandoCliente = vEnCurso
          ? (vEnCurso.clienteExterno?.nombre || vEnCurso.cliente?.nom || vEnCurso.prospecto?.nombreComercial || 'Cliente en Visita')
          : 'Ninguno';

        return {
          ...c,
          nombreCompleto: `${c.nombre} ${c.apellido || ''}`.trim(),
          perfil: c.role?.name || c.cargo || 'Comercial en Campo',
          cargo: c.cargo || 'Asesor Comercial',
          estado,
          estadoOperativo,
          disponible,
          jornadaIniciada,
          jornadaFinalizada,
          ultimaUbicacion,
          visitandoCliente,
          delegadoResponsable: delegadoResponsableTexto,
          jornadaActivaId: jActiva?.id || null,
          horaInicioJornada: jActiva?.horaInicio || null,
          latActual: latVal || null,
          lngActual: lngVal || null,
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
          estado: { not: 'Finalizada' }
        }
      });

      // 9. Actividades asignadas hoy
      const actividadesHoy = await prisma.actividadCampo.findMany({
        where: {
          usuarioId: { in: comercialesIds },
          fechaProgramada: { gte: startOfDay, lte: endOfDay }
        }
      });
      const actAsignadasCount = actividadesHoy.length;
      const actCumplidasCount = actividadesHoy.filter(a => a.estado === 'Finalizada').length;
      const pctCumplimiento = actAsignadasCount > 0
        ? Math.round((actCumplidasCount / actAsignadasCount) * 100)
        : (totalVisitasHoy > 0 ? Math.round((realizadasHoy / totalVisitasHoy) * 100) : 100);

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

  async getClientesExternos(req, res) {
    try {
      const { etapa, tipo, search, usuarioId } = req.query;
      const esDel = this.esDelegado(req.user);
      const targetUserId = esDel ? usuarioId : req.user.id;
      const data = await operacionExternaService.getClientesExternos({
        usuarioId: targetUserId,
        etapa,
        tipo,
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
      await this.registrarAuditoria(req.user.id, 'CREAR_CLIENTE_EXTERNO', { id: data.id, nombre: data.nombre }, null, req);
      res.status(201).json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizarClienteExterno(req, res) {
    try {
      const data = await operacionExternaService.actualizarClienteExterno(req.params.id, req.body);
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
      await this.registrarAuditoria(req.user.id, 'CAMBIO_ETAPA_EMBUDO', { id: req.params.id, etapa }, null, req);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err.message });
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
      res.status(201).json(data);
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
}

module.exports = new CampoController();
