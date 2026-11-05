const prisma = require('../../prisma');

class EvidenciasService {
  /**
   * Listar evidencias con filtros
   */
  async listarEvidencias(usuarioId, query = {}, userRole = '', userObject = null) {
    const { tipo, fecha, visitaId, actividadId, personalId } = query;

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

    const where = {};
    if (personalId && isAdminOrSupervisor) {
      where.usuarioId = personalId;
    } else if (query.usuarioId && isAdminOrSupervisor) {
      where.usuarioId = query.usuarioId;
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
        visita: { select: { id: true, codigo: true, clienteId: true, prospectoId: true, resultadoResumen: true } },
        actividad: { select: { id: true, codigo: true, titulo: true } }
      },
      take: 150
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
  async listarSeguimientos(usuarioId, query = {}, userRole = '', userObject = null) {
    const { clienteId, prospectoId, personalId } = query;

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

    const where = {};
    if (personalId && isAdminOrSupervisor) {
      where.usuarioId = personalId;
    } else if (query.usuarioId && isAdminOrSupervisor && query.usuarioId !== 'TODOS') {
      where.usuarioId = query.usuarioId;
    } else if (!isAdminOrSupervisor) {
      where.usuarioId = usuarioId;
    }

    if (clienteId) {
      where.OR = [
        { clienteId },
        { clienteExternoId: clienteId }
      ];
    }
    if (query.clienteExternoId) where.clienteExternoId = query.clienteExternoId;
    if (prospectoId) where.prospectoId = prospectoId;

    const seguimientos = await prisma.seguimientoCampo.findMany({
      where,
      orderBy: { fechaHora: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
        visita: { select: { id: true, codigo: true, tipoVisita: true, duracionMin: true, resultadoResumen: true, checkInHora: true, checkOutHora: true } },
        cliente: { select: { id: true, nom: true, tel: true, direccion: true } },
        clienteExterno: { select: { id: true, nombre: true, nitDoc: true, telefono: true, direccion: true, ciudad: true, etapaEmbudo: true } },
        prospecto: { select: { id: true, nombreComercial: true, direccion: true } }
      },
      take: 250
    });

    // Consolidar también los acuerdos, actividades y seguimientos reales registrados en VisitaCampo
    const whereVisitas = {};
    if (where.usuarioId) whereVisitas.usuarioId = where.usuarioId;
    if (clienteId) {
      whereVisitas.OR = [
        { clienteId },
        { clienteExternoId: clienteId }
      ];
    } else if (query.clienteExternoId) {
      whereVisitas.clienteExternoId = query.clienteExternoId;
    } else {
      whereVisitas.checkInHora = { not: null };
    }

    const visitasConGestion = await prisma.visitaCampo.findMany({
      where: whereVisitas,
      orderBy: { checkInHora: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } },
        cliente: { select: { id: true, nom: true, tel: true, direccion: true } },
        clienteExterno: { select: { id: true, nombre: true, nitDoc: true, telefono: true, direccion: true, ciudad: true, etapaEmbudo: true } },
        prospecto: { select: { id: true, nombreComercial: true, direccion: true } }
      },
      take: 250
    }).catch(() => []);

    const visitasYaEnSeguimiento = new Set(seguimientos.map(s => s.visitaId).filter(Boolean));

    const seguimientosEnriquecidos = seguimientos.map(s => {
      const nombreCli = s.clienteExterno?.nombre || s.cliente?.nom || s.prospecto?.nombreComercial || s.visita?.resultadoResumen || 'Cliente en Terreno';
      return {
        ...s,
        clienteNombre: nombreCli,
        clienteExterno: s.clienteExterno || {
          id: s.clienteExternoId || s.clienteId || null,
          nombre: nombreCli,
          telefono: s.cliente?.tel || '',
          direccion: s.cliente?.direccion || ''
        }
      };
    });

    const seguimientosDeVisitas = visitasConGestion
      .filter(v => !visitasYaEnSeguimiento.has(v.id) && (v.actividadesRealizadas || v.observaciones || v.compromisos || v.resultadoResumen))
      .map(v => {
        const nombreCli = v.resultadoResumen || v.clienteExterno?.nombre || v.cliente?.nom || v.prospecto?.nombreComercial || 'Cliente en Terreno';
        const fechaRef = v.checkOutHora || v.checkInHora || v.fechaProgramada || v.createdAt;
        return {
          id: `SEG-VIS-${v.id}`,
          esDeVisita: true,
          visitaId: v.id,
          usuarioId: v.usuarioId,
          clienteId: v.clienteId,
          clienteExternoId: v.clienteExternoId,
          prospectoId: v.prospectoId,
          tipoAccion: v.tipoVisita || 'Visita en Terreno',
          resultado: v.resultadoVisita || (v.checkOutHora ? 'Visita Realizada' : 'En Sitio'),
          observaciones: v.actividadesRealizadas || v.observaciones || `Visita comercial a ${nombreCli}`,
          compromisos: v.compromisos || null,
          proximaActividad: v.proximaActividad || null,
          fechaProgramada: v.proximaVisita || null,
          fechaHora: fechaRef,
          createdAt: fechaRef,
          duracionMin: v.duracionMin || 0,
          checkInHora: v.checkInHora,
          checkOutHora: v.checkOutHora,
          clienteNombre: nombreCli,
          usuario: v.usuario,
          visita: {
            id: v.id,
            codigo: v.codigo,
            tipoVisita: v.tipoVisita,
            duracionMin: v.duracionMin,
            resultadoResumen: v.resultadoResumen,
            checkInHora: v.checkInHora,
            checkOutHora: v.checkOutHora
          },
          cliente: v.cliente,
          clienteExterno: v.clienteExterno || {
            id: v.clienteExternoId || `VIS-CLI-${v.id}`,
            nombre: nombreCli,
            telefono: v.cliente?.tel || '',
            direccion: v.cliente?.direccion || 'Cartagena',
            ciudad: 'Cartagena',
            etapaEmbudo: 'Visita'
          },
          prospecto: v.prospecto
        };
      });

    const consolidados = [...seguimientosEnriquecidos, ...seguimientosDeVisitas].sort(
      (a, b) => new Date(b.fechaHora || b.createdAt || 0) - new Date(a.fechaHora || a.createdAt || 0)
    );

    return { success: true, seguimientos: consolidados };
  }
}

module.exports = new EvidenciasService();
