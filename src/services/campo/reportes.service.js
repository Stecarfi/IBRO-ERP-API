const prisma = require('../../prisma');

class ReportesCampoService {
  /**
   * Consolidado de métricas operativas por filtros en español claro
   */
  async generarReporte(usuarioId, query = {}, userRole = '') {
    const {
      fechaInicio,
      fechaFin,
      personalId,
      ciudad,
      clienteId,
      estadoVisita
    } = query;

    const isAdminOrSupervisor = ['admin', '1', 'director', 'coordinador', 'supervisor'].some(r =>
      (userRole || '').toLowerCase().includes(r)
    );

    const whereJornada = {};
    const whereVisita = {};
    const whereActividad = {};
    const whereEvidencia = {};

    // Filtro por usuario
    if (personalId && isAdminOrSupervisor) {
      whereJornada.usuarioId = personalId;
      whereVisita.usuarioId = personalId;
      whereActividad.usuarioId = personalId;
      whereEvidencia.usuarioId = personalId;
    } else if (!isAdminOrSupervisor) {
      whereJornada.usuarioId = usuarioId;
      whereVisita.usuarioId = usuarioId;
      whereActividad.usuarioId = usuarioId;
      whereEvidencia.usuarioId = usuarioId;
    }

    // Filtro por rango de fechas
    if (fechaInicio && fechaFin) {
      const fIni = new Date(fechaInicio);
      fIni.setHours(0, 0, 0, 0);
      const fFin = new Date(fechaFin);
      fFin.setHours(23, 59, 59, 999);

      whereJornada.horaInicio = { gte: fIni, lte: fFin };
      whereVisita.fechaProgramada = { gte: fIni, lte: fFin };
      whereActividad.fechaProgramada = { gte: fIni, lte: fFin };
      whereEvidencia.fechaHora = { gte: fIni, lte: fFin };
    }

    if (estadoVisita && estadoVisita !== 'TODOS') {
      whereVisita.estado = estadoVisita;
    }

    if (clienteId) {
      whereVisita.clienteId = clienteId;
    }

    // 1. Obtener jornadas laborales
    const jornadas = await prisma.jornadaLaboral.findMany({
      where: whereJornada,
      orderBy: { horaInicio: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } }
      }
    });

    // 2. Obtener visitas realizadas
    const visitas = await prisma.visitaCampo.findMany({
      where: whereVisita,
      orderBy: { fechaProgramada: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } },
        cliente: { select: { id: true, nom: true, tel: true, direccion: true } },
        prospecto: { select: { id: true, nombreComercial: true, ciudad: true } }
      }
    });

    // Filtro adicional por ciudad en memoria si aplica
    let visitasFiltradas = visitas;
    if (ciudad && ciudad.trim()) {
      const cLower = ciudad.toLowerCase();
      visitasFiltradas = visitas.filter(v =>
        (v.cliente?.direccion || '').toLowerCase().includes(cLower) ||
        (v.prospecto?.ciudad || '').toLowerCase().includes(cLower)
      );
    }

    // 3. Obtener actividades
    const actividades = await prisma.actividadCampo.findMany({
      where: whereActividad,
      include: { usuario: { select: { id: true, nombre: true } } }
    });

    // 4. Obtener evidencias
    const totalEvidencias = await prisma.evidenciaCampo.count({
      where: whereEvidencia
    });

    // 5. Total de seguimientos
    const totalSeguimientos = await prisma.seguimientoCampo.count({
      where: personalId ? { usuarioId: personalId } : (!isAdminOrSupervisor ? { usuarioId } : {})
    });

    // Cálculos consolidados en español claro
    const jornadasRealizadas = jornadas.length;
    const minutosTotalesTrabajados = jornadas.reduce((acc, j) => acc + (j.tiempoTotalMin || 0), 0);
    const horasTrabajadas = Number((minutosTotalesTrabajados / 60).toFixed(1));

    const visitasEjecutadas = visitasFiltradas.filter(v => v.estado === 'Realizada').length;
    const duracionVisitasMin = visitasFiltradas.reduce((acc, v) => acc + (v.duracionMin || 0), 0);
    const tiempoPromedioPorVisitaMin = visitasEjecutadas > 0 ? Math.round(duracionVisitasMin / visitasEjecutadas) : 0;

    const actividadesRealizadas = actividades.filter(a => a.estado === 'Finalizada').length;

    return {
      success: true,
      resumen: {
        horasTrabajadas,
        jornadasRealizadas,
        visitasTotales: visitasFiltradas.length,
        visitasEjecutadas,
        actividadesTotales: actividades.length,
        actividadesRealizadas,
        tiempoPromedioPorVisitaMin,
        evidenciasRegistradas: totalEvidencias,
        seguimientosRealizados: totalSeguimientos
      },
      jornadas,
      visitas: visitasFiltradas,
      actividades
    };
  }
}

module.exports = new ReportesCampoService();
