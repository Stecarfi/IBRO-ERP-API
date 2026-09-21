const prisma = require('../../prisma');

class ActividadesService {
  /**
   * Listar actividades con filtros por estado, fecha y usuario
   */
  async listarActividades(usuarioId, query = {}, userRole = '') {
    const { estado, fecha, personalId } = query;

    const where = {};
    const isAdminOrSupervisor = ['admin', '1', 'director', 'coordinador', 'supervisor'].some(r =>
      (userRole || '').toLowerCase().includes(r)
    );

    if (personalId && isAdminOrSupervisor) {
      where.usuarioId = personalId;
    } else if (!isAdminOrSupervisor) {
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
      visitaId = null
    } = data;

    if (!titulo || !titulo.trim()) {
      return { success: false, error: 'El título de la actividad es obligatorio.' };
    }

    const count = await prisma.actividadCampo.count();
    let codigo = `ACT-${String(count + 1).padStart(5, '0')}`;
    const exists = await prisma.actividadCampo.findUnique({ where: { codigo } });
    if (exists) {
      codigo = `ACT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
    }

    const actividad = await prisma.actividadCampo.create({
      data: {
        codigo,
        usuarioId: asignadoAId || usuarioId,
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

    return { success: true, actividad };
  }

  /**
   * Actualizar estado de una actividad (Pendiente, En ejecucion, Finalizada, Reprogramada)
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
    if (estado === 'Finalizada') {
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
