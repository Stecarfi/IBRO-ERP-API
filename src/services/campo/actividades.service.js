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

    const targetUsuarioId = personalId || query.usuarioId;
    if (targetUsuarioId && targetUsuarioId !== 'TODOS') {
      where.usuarioId = targetUsuarioId;
    } else if (!isAdminOrSupervisor) {
      // Comercial en campo ve estrictamente sus actividades asignadas
      where.usuarioId = usuarioId;
    }

    if (estado && estado !== 'TODAS') {
      if (estado === 'Completada' || estado === 'Finalizada') {
        where.estado = { in: ['Completada', 'Finalizada'] };
      } else {
        where.estado = estado;
      }
    }

    if (fecha) {
      const fechaStr = String(fecha).split('T')[0];
      const start = new Date(`${fechaStr}T00:00:00.000Z`);
      const end = new Date(new Date(`${fechaStr}T23:59:59.999Z`).getTime() + 6 * 3600 * 1000);
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
   * Crear nueva actividad / tarea en campo
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
      return { success: false, error: 'El título de la tarea / actividad es obligatorio.' };
    }

    const targetUserId = asignadoAId || comercialId || usuarioAsignadoId || data.usuarioId || usuarioId;

    const count = await prisma.actividadCampo.count();
    let codigo = `ACT-${String(count + 1).padStart(5, '0')}`;
    const exists = await prisma.actividadCampo.findUnique({ where: { codigo } });
    if (exists) {
      codigo = `ACT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
    }

    const fechaObj = String(fechaProgramada).includes('T')
      ? new Date(fechaProgramada)
      : new Date(`${String(fechaProgramada).split('T')[0]}T12:00:00.000Z`);

    let creadorNombre = 'Delegado de Gerencia';
    try {
      const creadorUser = await prisma.user.findUnique({ where: { id: usuarioId }, select: { nombre: true, apellido: true, user: true } });
      if (creadorUser) creadorNombre = `${creadorUser.nombre || ''} ${creadorUser.apellido || ''}`.trim() || creadorUser.user;
    } catch (e) {}

    let responsableNombre = 'Asesor Asignado';
    try {
      const respUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { nombre: true, apellido: true, user: true } });
      if (respUser) responsableNombre = `${respUser.nombre || ''} ${respUser.apellido || ''}`.trim() || respUser.user;
    } catch (e) {}

    const initialComments = [
      {
        fecha: new Date().toISOString(),
        usuarioId,
        usuario: creadorNombre,
        accion: 'CREACION',
        tipo: 'evento',
        estadoAnterior: null,
        estadoNuevo: 'Pendiente',
        responsableAnterior: null,
        responsableActual: responsableNombre,
        responsableActualId: targetUserId,
        texto: `Tarea asignada a ${responsableNombre} por ${creadorNombre}.${descripcion ? ` Instrucciones: ${descripcion.trim()}` : ''}`
      }
    ];

    const actividad = await prisma.actividadCampo.create({
      data: {
        codigo,
        usuarioId: targetUserId,
        asignadoPorId: usuarioId,
        visitaId: visitaId || null,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        prioridad,
        fechaProgramada: fechaObj,
        horaEstimada,
        estado: 'Pendiente',
        comentarios: initialComments,
        evidencias: Array.isArray(data.evidencias || data.adjuntos) ? (data.evidencias || data.adjuntos) : []
      },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } },
        asignadoPor: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Notificar al asesor/colaborador asignado
    if (targetUserId && String(targetUserId) !== String(usuarioId)) {
      try {
        const notifId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        await prisma.notificacion.create({
          data: {
            id: notifId,
            paraId: targetUserId,
            titulo: 'Nueva Tarea Asignada por el Delegado',
            mensaje: `El Delegado de Gerencia ${creadorNombre} le ha asignado la tarea: "${titulo.trim()}". Prioridad: ${prioridad}.`,
            de: creadorNombre,
            tipo: 'actividad_asignada',
            fecha: new Date(),
            leida: false,
            targetModule: 'comercial_campo'
          }
        });
      } catch (errNotif) {
        console.error('Error generando notificación de tarea:', errNotif);
      }
    }

    return { success: true, actividad };
  }

  /**
   * Actualizar estado de una actividad (Pendiente, En ejecucion, Finalizada, Completada, Aprobada, En Corrección, Reprogramada)
   */
  async actualizarEstado(usuarioId, actividadId, data) {
    const { estado, comentario = '', nuevaFecha = null, evidencias = [], adjuntos = [], accion = null, instrucciones = '', motivo = '' } = data;

    const actividad = await prisma.actividadCampo.findUnique({
      where: { id: actividadId },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, user: true } },
        asignadoPor: { select: { id: true, nombre: true, apellido: true, user: true } }
      }
    });

    if (!actividad) {
      return { success: false, error: 'Actividad / Tarea no encontrada.' };
    }

    let nuevoEstado = estado || actividad.estado;
    if (accion === 'APROBACION') nuevoEstado = 'Aprobada';
    if (accion === 'SOLICITUD_CORRECCION') nuevoEstado = 'En Corrección';
    if (accion === 'REAPERTURA') nuevoEstado = 'En ejecucion';

    const updateData = { estado: nuevoEstado };
    if (nuevoEstado === 'Finalizada' || nuevoEstado === 'Completada' || nuevoEstado === 'Aprobada') {
      updateData.fechaFinalizacion = new Date();
    } else if (nuevoEstado === 'En Corrección' || nuevoEstado === 'En ejecucion' || nuevoEstado === 'Pendiente') {
      updateData.fechaFinalizacion = null;
    }

    if (nuevoEstado === 'Reprogramada' && nuevaFecha) {
      updateData.fechaProgramada = String(nuevaFecha).includes('T')
        ? new Date(nuevaFecha)
        : new Date(`${String(nuevaFecha).split('T')[0]}T12:00:00.000Z`);
    }

    let userName = 'Colaborador';
    try {
      const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { nombre: true, apellido: true, user: true } });
      if (u) userName = `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.user || 'Colaborador';
    } catch (e) {}

    const existingComments = Array.isArray(actividad.comentarios) ? actividad.comentarios : [];
    const incomingEvidencias = Array.isArray(evidencias) && evidencias.length > 0 ? evidencias : (Array.isArray(adjuntos) ? adjuntos : []);
    
    // Determinar detalle y tipo de acción de auditoría
    let accionEvento = accion || 'CAMBIO_ESTADO';
    let textoEvento = comentario || '';
    if (nuevoEstado === 'Aprobada' || accion === 'APROBACION') {
      accionEvento = 'APROBACION';
      textoEvento = comentario || 'Gestión verificada y aprobada por el Delegado de Gerencia.';
    } else if (nuevoEstado === 'En Corrección' || accion === 'SOLICITUD_CORRECCION') {
      accionEvento = 'SOLICITUD_CORRECCION';
      textoEvento = instrucciones || comentario || 'El Delegado de Gerencia solicitó correcciones sobre la gestión realizada.';
    } else if (accion === 'REAPERTURA') {
      accionEvento = 'REAPERTURA';
      textoEvento = motivo || comentario || 'Actividad reabierta por el Delegado de Gerencia para seguimiento.';
    } else if (nuevoEstado === 'Completada' || nuevoEstado === 'Finalizada') {
      accionEvento = 'EJECUCION';
      textoEvento = comentario || 'Tarea ejecutada y marcada como completada en terreno.';
    }

    const eventoAuditoria = {
      fecha: new Date().toISOString(),
      usuarioId,
      usuario: userName,
      accion: accionEvento,
      tipo: 'evento',
      estadoAnterior: actividad.estado,
      estadoNuevo: nuevoEstado,
      texto: textoEvento,
      evidencias: incomingEvidencias.length > 0 ? incomingEvidencias : undefined
    };

    existingComments.push(eventoAuditoria);
    updateData.comentarios = existingComments;

    if (incomingEvidencias.length > 0) {
      const existingEvidencias = Array.isArray(actividad.evidencias) ? actividad.evidencias : [];
      updateData.evidencias = [...existingEvidencias, ...incomingEvidencias];
    }

    const actividadActualizada = await prisma.actividadCampo.update({
      where: { id: actividadId },
      data: updateData,
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } },
        asignadoPor: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Notificaciones cruzadas automáticas
    try {
      const notifId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
      const esRuta = (actividad.codigo || '').startsWith('RUT-') || (actividad.titulo || '').toLowerCase().startsWith('ruta:');
      
      // Si el Delegado solicita corrección o aprueba, notificar al asesor
      if ((nuevoEstado === 'En Corrección' || nuevoEstado === 'Aprobada') && actividad.usuarioId) {
        await prisma.notificacion.create({
          data: {
            id: notifId,
            paraId: actividad.usuarioId,
            titulo: nuevoEstado === 'Aprobada' ? 'Gestión de Tarea Aprobada' : '⚠️ Solicitud de Corrección en Tarea',
            mensaje: nuevoEstado === 'Aprobada'
              ? `El Delegado de Gerencia ${userName} ha aprobado la gestión de la tarea: "${actividad.titulo}".`
              : `El Delegado de Gerencia ${userName} ha devuelto la tarea "${actividad.titulo}" para corrección: "${textoEvento}".`,
            de: userName,
            tipo: nuevoEstado === 'Aprobada' ? 'tarea_aprobada' : 'tarea_correccion',
            fecha: new Date(),
            leida: false,
            targetModule: 'comercial_campo'
          }
        });
      } else if ((nuevoEstado === 'Completada' || nuevoEstado === 'Finalizada') && actividad.asignadoPorId && actividad.asignadoPorId !== usuarioId) {
        // Asesor cumplió la tarea: notificar al Delegado
        await prisma.notificacion.create({
          data: {
            id: notifId,
            paraId: actividad.asignadoPorId,
            titulo: esRuta ? 'Cumplimiento de Ruta Registrado' : 'Cumplimiento de Tarea Registrado',
            mensaje: `El asesor ${userName} completó la tarea: "${actividad.titulo}".${comentario ? ` Observaciones: ${comentario}` : ''}`,
            de: userName,
            tipo: 'cumplimiento_asignacion',
            fecha: new Date(),
            leida: false,
            targetModule: 'control_gerencial'
          }
        });
      }
    } catch (errNotif) {
      console.error('Error generando notificación de estado:', errNotif);
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
