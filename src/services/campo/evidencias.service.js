const prisma = require('../../prisma');

class EvidenciasService {
  /**
   * Listar evidencias con filtros
   */
  async listarEvidencias(usuarioId, query = {}, userRole = '') {
    const { tipo, fecha, visitaId, actividadId, personalId } = query;

    const where = {};
    const isAdminOrSupervisor = ['admin', '1', 'director', 'coordinador', 'supervisor'].some(r =>
      (userRole || '').toLowerCase().includes(r)
    );

    if (personalId && isAdminOrSupervisor) {
      where.usuarioId = personalId;
    } else if (!isAdminOrSupervisor) {
      where.usuarioId = usuarioId;
    }

    if (tipo && tipo !== 'TODOS') {
      where.tipo = tipo;
    }
    if (visitaId) where.visitaId = visitaId;
    if (actividadId) where.actividadId = actividadId;

    if (fecha) {
      const start = new Date(fecha);
      start.setHours(0, 0, 0, 0);
      const end = new Date(fecha);
      end.setHours(23, 59, 59, 999);
      where.fechaHora = { gte: start, lte: end };
    }

    const evidencias = await prisma.evidenciaCampo.findMany({
      where,
      orderBy: { fechaHora: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
        visita: { select: { id: true, codigo: true, clienteId: true, prospectoId: true } },
        actividad: { select: { id: true, codigo: true, titulo: true } }
      },
      take: 100
    });

    return { success: true, evidencias };
  }

  /**
   * Registrar nueva evidencia con georreferenciación
   */
  async registrarEvidencia(usuarioId, data) {
    const {
      url,
      tipo = 'Fotografia', // "Fotografia" | "Video" | "Documento" | "PDF" | "Audio"
      nombreArchivo = 'Evidencia',
      tamanoBytes = 0,
      lat = null,
      lng = null,
      direccion = '',
      visitaId = null,
      actividadId = null,
      observaciones = ''
    } = data;

    if (!url) {
      return { success: false, error: 'La URL o archivo de evidencia es obligatorio.' };
    }

    // Si tiene jornada activa, vincularla
    const jornadaActiva = await prisma.jornadaLaboral.findFirst({
      where: { usuarioId, estado: { in: ['Iniciada', 'En Pausa'] } },
      orderBy: { horaInicio: 'desc' }
    });

    const evidencia = await prisma.evidenciaCampo.create({
      data: {
        usuarioId,
        jornadaId: jornadaActiva?.id || null,
        visitaId: visitaId || null,
        actividadId: actividadId || null,
        tipo,
        url,
        nombreArchivo,
        tamanoBytes: parseInt(tamanoBytes) || 0,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        direccion,
        fechaHora: new Date(),
        observaciones
      },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    return { success: true, evidencia };
  }

  /**
   * Listar historial y seguimiento continuo de clientes y visitas
   */
  async listarSeguimientos(usuarioId, query = {}, userRole = '') {
    const { clienteId, prospectoId, personalId } = query;

    const where = {};
    const isAdminOrSupervisor = ['admin', '1', 'director', 'coordinador', 'supervisor'].some(r =>
      (userRole || '').toLowerCase().includes(r)
    );

    if (personalId && isAdminOrSupervisor) {
      where.usuarioId = personalId;
    } else if (!isAdminOrSupervisor) {
      where.usuarioId = usuarioId;
    }

    if (clienteId) where.clienteId = clienteId;
    if (prospectoId) where.prospectoId = prospectoId;

    const seguimientos = await prisma.seguimientoCampo.findMany({
      where,
      orderBy: { fechaHora: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
        visita: { select: { id: true, codigo: true, tipoVisita: true, duracionMin: true } },
        cliente: { select: { id: true, nom: true, tel: true, direccion: true } },
        prospecto: { select: { id: true, nombreComercial: true, direccion: true } }
      },
      take: 150
    });

    return { success: true, seguimientos };
  }
}

module.exports = new EvidenciasService();
