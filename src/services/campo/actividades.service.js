const prisma = require('../../prisma');

class ActividadesService {
  /**
   * Listar actividades con filtros por estado, fecha y usuario
   */
  async listarActividades(usuarioId, query = {}, userRole = '', userObject = null) {
    const { estado, fecha, personalId } = query;

    // Normalizar role a string de forma segura
    let roleStr = '';
    if (typeof userRole === 'string') {
      roleStr = userRole.toLowerCase();
    } else if (userRole && typeof userRole === 'object') {
      roleStr = (userRole.name || userRole.nombre || userRole.cargo || '').toLowerCase();
    }
    const cargoStr = String(userObject?.cargo || '').toLowerCase();
    const esDelegado = Boolean(userObject?.esDelegadoGerencia);
    const roleId = String(userObject?.roleId || '');

    const isAdminOrSupervisor = esDelegado || roleId === '1' || ['admin', '1', 'director', 'directora', 'gerent', 'coordinador', 'supervisor', 'delegad'].some(r =>
      roleStr.includes(r) || cargoStr.includes(r)
    );

    const where = {
      // Excluir rutas de las actividades estándar para que no se dupliquen con /campo/rutas
      NOT: [
        { codigo: { startsWith: 'RUT-' } },
        { titulo: { startsWith: 'Ruta:' } }
      ]
    };

    if (personalId && isAdminOrSupervisor) {
      where.usuarioId = personalId;
    } else if (query.usuarioId && isAdminOrSupervisor) {
      where.usuarioId = query.usuarioId;
    } else if (!isAdminOrSupervisor) {
      // Comercial en campo ve estrictamente sus actividades asignadas
      where.usuarioId = usuarioId;
    }

    if (estado && estado !== 'TODAS') {
      where.estado = estado;
    }

    if (fecha) {
      const start = new Date(fecha);
      start.setHours(0, 0, 0, 0);
      const end = new Date(fecha);
      end.setHours(23, 59, 59, 999);
      where.fechaProgramada = { gte: start, lte: end };
    }

    const actividades = await prisma.actividadCampo.findMany({
      where,
      orderBy: [{ fechaProgramada: 'asc' }, { createdAt: 'desc' }],
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
        asignadoPor: { select: { id: true, nombre: true, apellido: true } },
        visita: { select: { id: true, codigo: true, clienteId: true, prospectoId: true } }
      }
    });

    return { success: true, actividades };
  }

  /**
   * Crear nueva actividad en campo
   */
  async crearActividad(usuarioId, data) {
    const {
      titulo,
      descripcion = '',
      prioridad = 'Normal',
      fechaProgramada = new Date(),
      horaEstimada = '08:00 AM',
      asignadoAId = null,
      comercialId = null,
      usuarioAsignadoId = null,
      visitaId = null
    } = data;

    if (!titulo || !titulo.trim()) {
      return { success: false, error: 'El título de la actividad es obligatorio.' };
    }

    const targetUserId = asignadoAId || comercialId || usuarioAsignadoId || data.usuarioId || usuarioId;

    const count = await prisma.actividadCampo.count();
    let codigo = `ACT-${String(count + 1).padStart(5, '0')}`;
    const exists = await prisma.actividadCampo.findUnique({ where: { codigo } });
    if (exists) {
      codigo = `ACT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
    }

    const actividad = await prisma.actividadCampo.create({
      data: {
        codigo,
        usuarioId: targetUserId,
        asignadoPorId: usuarioId,
        visitaId: visitaId || null,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        prioridad,
        fechaProgramada: new Date(fechaProgramada),
        horaEstimada,
        estado: 'Pendiente',
        comentarios: [],
        evidencias: Array.isArray(data.evidencias || data.adjuntos) ? (data.evidencias || data.adjuntos) : []
      },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Notificar al asesor/colaborador asignado
    if (targetUserId && String(targetUserId) !== String(usuarioId)) {
      try {
        const delegado = await prisma.user.findUnique({ where: { id: usuarioId }, select: { nombre: true, user: true } });
        const notifId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        await prisma.notificacion.create({
          data: {
            id: notifId,
            paraId: targetUserId,
            titulo: 'Nueva Actividad Asignada por Delegado',
            mensaje: `El Delegado de Gerencia ${delegado?.nombre || delegado?.user || 'Delegado'} le ha asignado la tarea: "${titulo.trim()}". Prioridad: ${prioridad}.`,
            de: `${delegado?.nombre || delegado?.user || 'Delegado de Gerencia'}`,
            tipo: 'actividad_asignada',
            fecha: new Date(),
            leida: false,
            targetModule: 'comercial_campo'
          }
        });
      } catch (errNotif) {
        console.error('Error generando notificación de actividad:', errNotif);
      }
    }

    return { success: true, actividad };
  }

  /**
   * Actualizar estado de una actividad (Pendiente, En ejecucion, Finalizada, Completada, Reprogramada)
   */
  async actualizarEstado(usuarioId, actividadId, data) {
    const { estado, comentario = '', nuevaFecha = null, evidencias = [], adjuntos = [] } = data;

    const actividad = await prisma.actividadCampo.findUnique({
      where: { id: actividadId }
    });

    if (!actividad) {
      return { success: false, error: 'Actividad no encontrada.' };
    }

    const updateData = { estado };
    if (estado === 'Finalizada' || estado === 'Completada') {
      updateData.fechaFinalizacion = new Date();
    }
    if (estado === 'Reprogramada' && nuevaFecha) {
      updateData.fechaProgramada = new Date(nuevaFecha);
    }

    const existingComments = Array.isArray(actividad.comentarios) ? actividad.comentarios : [];
    if (comentario && comentario.trim()) {
      existingComments.push({
        fecha: new Date().toISOString(),
        usuarioId,
        texto: comentario.trim()
      });
      updateData.comentarios = existingComments;
    }

    const incomingEvidencias = Array.isArray(evidencias) && evidencias.length > 0 ? evidencias : (Array.isArray(adjuntos) ? adjuntos : []);
    if (incomingEvidencias.length > 0) {
      const existingEvidencias = Array.isArray(actividad.evidencias) ? actividad.evidencias : [];
      updateData.evidencias = [...existingEvidencias, ...incomingEvidencias];
    }

    const actividadActualizada = await prisma.actividadCampo.update({
      where: { id: actividadId },
      data: updateData,
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Notificar al Delegado de Gerencia sobre el registro de cumplimiento
    if (actividad.asignadoPorId && actividad.asignadoPorId !== usuarioId) {
      try {
        const asesor = await prisma.user.findUnique({ where: { id: usuarioId }, select: { nombre: true, user: true } });
        const notifId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        const esRuta = (actividad.codigo || '').startsWith('RUT-') || (actividad.titulo || '').toLowerCase().startsWith('ruta:');
        await prisma.notificacion.create({
          data: {
            id: notifId,
            paraId: actividad.asignadoPorId,
            titulo: esRuta ? 'Cumplimiento de Ruta Registrado' : 'Cumplimiento de Actividad Registrado',
            mensaje: `El asesor ${asesor?.nombre || asesor?.user || 'Comercial'} actualizó el estado a "${estado}" para: "${actividad.titulo}".${comentario ? ` Observaciones: ${comentario}` : ''}`,
            de: `${asesor?.nombre || asesor?.user || 'Comercial en Campo'}`,
            tipo: 'cumplimiento_asignacion',
            fecha: new Date(),
            leida: false,
            targetModule: 'control_gerencial'
          }
        });
      } catch (errNotif) {
        console.error('Error notificando cumplimiento al Delegado:', errNotif);
      }
    }

    return { success: true, actividad: actividadActualizada };
  }

  /**
   * Añadir comentario a la actividad
   */
  async agregarComentario(usuarioId, actividadId, texto) {
    if (!texto || !texto.trim()) {
      return { success: false, error: 'El texto del comentario es obligatorio.' };
    }

    const actividad = await prisma.actividadCampo.findUnique({
      where: { id: actividadId }
    });

    if (!actividad) return { success: false, error: 'Actividad no encontrada.' };

    const comentarios = Array.isArray(actividad.comentarios) ? actividad.comentarios : [];
    comentarios.push({
      fecha: new Date().toISOString(),
      usuarioId,
      texto: texto.trim()
    });

    const actualizada = await prisma.actividadCampo.update({
      where: { id: actividadId },
      data: { comentarios }
    });

    return { success: true, actividad: actualizada };
  }
}

module.exports = new ActividadesService();
