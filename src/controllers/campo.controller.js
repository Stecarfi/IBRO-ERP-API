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
  // Helper de permisos del Delegado de Gerencia
  esDelegado(user) {
    if (!user) return false;
    // Si tiene la bandera esDelegadoGerencia = true, es Delegado incondicionalmente
    if (user.esDelegadoGerencia === true || user.esDelegadoGerencia === 'true') return true;
    // Administrador principal o usuario admin
    if (String(user.roleId) === '1' || user.user?.toLowerCase() === 'admin') return true;
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

  // --- 10. NOVEDADES Y SEGUIMIENTO DEL DELEGADO DE GERENCIA ---
  async crearNovedadDelegado(req, res) {
    try {
      if (!this.esDelegado(req.user)) {
        return res.status(403).json({ error: 'Solo el Delegado de Gerencia puede registrar novedades de supervisión.' });
      }

      const novedad = await evaluacionesCampoService.crearNovedadDelegado(req.user.id, req.body);

      await this.registrarAuditoria(req.user.id, 'CAMPO_NOVEDAD_DELEGADO_CREADA', {
        novedadId: novedad.id,
        usuarioId: req.body.usuarioId,
        tipo: req.body.tipo,
        titulo: req.body.titulo
      }, {
        delegadoNombre: `${req.user.nombre} ${req.user.apellido}`
      }, req);

      res.json({ success: true, novedad });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async getNovedadesComercial(req, res) {
    try {
      const targetUserId = req.params.usuarioId || req.query.usuarioId;
      if (!targetUserId) return res.status(400).json({ error: 'usuarioId requerido' });

      if (!this.esDelegado(req.user) && req.user.id !== targetUserId) {
        return res.status(403).json({ error: 'Acceso denegado.' });
      }

      const novedades = await evaluacionesCampoService.getNovedadesComercial(targetUserId);
      res.json(novedades);
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
          esComercialCampo: true
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
        prospectoId,
        visitaId,
        resultado,
        observaciones = '',
        compromisos = '',
        proximaActividad = null,
        fechaProgramada = null
      } = req.body;

      if (!observaciones && !compromisos && !resultado) {
        return res.status(400).json({ error: 'Debe especificar al menos un resultado, observación o compromiso.' });
      }

      const nuevoSeguimiento = await prisma.seguimientoCampo.create({
        data: {
          usuarioId: req.user.id,
          clienteId: clienteId || null,
          prospectoId: prospectoId || null,
          visitaId: visitaId || null,
          resultado: resultado || 'Seguimiento registrado',
          observaciones: observaciones || compromisos || 'Seguimiento comercial',
          compromisos: compromisos || null,
          proximaActividad: proximaActividad || null,
          fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null
        },
        include: {
          cliente: true,
          prospecto: true,
          usuario: { select: { id: true, nombre: true, apellido: true } }
        }
      });

      // Si se definió próxima fecha programada, crear la actividad de seguimiento
      if (fechaProgramada) {
        const count = await prisma.actividadCampo.count();
        await prisma.actividadCampo.create({
          data: {
            codigo: `ACT-${String(count + 1).padStart(5, '0')}`,
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
        usuarioId,
        fecha,
        prioridad = 'Alta',
        clientesIds = [],
        instrucciones = ''
      } = req.body;

      if (!usuarioId) return res.status(400).json({ error: 'Debe seleccionar un comercial responsable para la ruta.' });
      if (!fecha) return res.status(400).json({ error: 'Debe especificar la fecha de la ruta.' });
      if (!Array.isArray(clientesIds) || clientesIds.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar al menos un cliente para la ruta.' });
      }

      const fechaRuta = new Date(fecha);
      const countAct = await prisma.actividadCampo.count();
      const codigoRuta = `RUT-${String(countAct + 1).padStart(5, '0')}`;

      // 1. Crear actividad matriz de la ruta
      const actividadRuta = await prisma.actividadCampo.create({
        data: {
          codigo: codigoRuta,
          usuarioId,
          asignadoPorId: req.user.id,
          titulo: `Ruta: ${nombreRuta || 'Ruta Comercial'}`,
          descripcion: `Instrucciones del Delegado: ${instrucciones}\nClientes asignados: ${clientesIds.length} paradas.`,
          prioridad,
          fechaProgramada: fechaRuta,
          estado: 'Pendiente',
          comentarios: [
            {
              fecha: new Date(),
              usuario: `${req.user.nombre} ${req.user.apellido}`,
              texto: `Ruta asignada con ${clientesIds.length} clientes por el Delegado de Gerencia.`
            }
          ]
        }
      });

      // 2. Programar las visitas asociadas a la ruta
      const visitasCreadas = [];
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
            fechaProgramada: fechaRuta,
            horaEstimada: horaEstimadaStr,
            compromisos: `Parada #${i + 1} de la ruta: ${nombreRuta || 'Asignada'}. ${instrucciones}`
          }
        });
        visitasCreadas.push(vis);
      }

      await this.registrarAuditoria(req.user.id, 'CAMPO_RUTA_ASIGNADA', {
        actividadRutaId: actividadRuta.id,
        usuarioAsignadoId: usuarioId,
        totalClientes: clientesIds.length,
        fecha
      });

      res.json({
        success: true,
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
        titulo: { startsWith: 'Ruta:' }
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

      // 1. Obtener todos los comerciales de campo
      const comerciales = await prisma.user.findMany({
        where: {
          esComercialCampo: true
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
      const delegadoSupervisor = await prisma.user.findFirst({
        where: { esDelegadoGerencia: true },
        select: { nombre: true, apellido: true, cargo: true }
      });
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
      const ultimosPingsHoy = await prisma.ubicacionCampo.findMany({
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
        comerciales: comercialesDetalle
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
      const { nuevaEtapa, nota } = req.body;
      const data = await operacionExternaService.cambiarEtapaEmbudo(req.params.id, req.user.id, nuevaEtapa, nota);
      await this.registrarAuditoria(req.user.id, 'CAMBIO_ETAPA_EMBUDO', { id: req.params.id, nuevaEtapa }, null, req);
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
