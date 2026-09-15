const prisma = require('../../prisma');

class ProductividadService {
  /**
   * Genera el cuadro de mando y analítica gerencial de productividad
   */
  async getDashboardProductividad(periodo = null, usuarioIdFiltro = null) {
    const ahora = new Date();
    const periodoActual = periodo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const [anio, mes] = periodoActual.split('-');

    const fechaInicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
    const fechaFin = new Date(parseInt(anio), parseInt(mes), 0, 23, 59, 59, 999);

    const whereUsuario = usuarioIdFiltro ? { usuarioId: usuarioIdFiltro } : {};

    // 1. Obtener jornadas del periodo
    const jornadas = await prisma.jornadaLaboral.findMany({
      where: {
        ...whereUsuario,
        fecha: { gte: fechaInicio, lte: fechaFin },
        estado: { in: ['Finalizada', 'Cierre Automatico'] }
      },
      include: {
        pausas: true,
        visitas: true
      }
    });

    // 2. Obtener visitas del periodo
    const visitas = await prisma.visitaCampo.findMany({
      where: {
        ...whereUsuario,
        fechaProgramada: { gte: fechaInicio, lte: fechaFin }
      }
    });

    // 3. Obtener prospectos del periodo
    const prospectos = await prisma.prospectoCampo.findMany({
      where: {
        ...(usuarioIdFiltro ? { creadoPorId: usuarioIdFiltro } : {}),
        fechaCreacion: { gte: fechaInicio, lte: fechaFin }
      }
    });

    // Cálculos de Tiempos Acumulados (minutos a horas)
    const tiempoTotalMin = jornadas.reduce((acc, j) => acc + (j.tiempoTotalMin || 0), 0);
    const tiempoEfectivoMin = jornadas.reduce((acc, j) => acc + (j.tiempoEfectivoMin || 0), 0);
    const tiempoTransitoMin = jornadas.reduce((acc, j) => acc + (j.tiempoTransitoMin || 0), 0);
    const tiempoDetenidoMin = jornadas.reduce((acc, j) => acc + (j.tiempoDetenidoMin || 0), 0);
    const distanciaTotalKm = jornadas.reduce((acc, j) => acc + (j.distanciaKm || 0), 0);

    // Métricas de Visitas
    const totalVisitas = visitas.length;
    const visitasRealizadas = visitas.filter(v => v.estado === 'Realizada').length;
    const visitasNoEfectivas = visitas.filter(v => v.estado === 'No Efectiva').length;
    const visitasConVentaOCotiz = visitas.filter(v => v.ventaId || v.cotizacionId).length;

    // Índice de Eficiencia Operativa (IEO)
    const ieo = tiempoTotalMin > 0 ? Number(((tiempoEfectivoMin / tiempoTotalMin) * 100).toFixed(1)) : 0;

    // Tasa de Efectividad Comercial (TEC)
    const tec = visitasRealizadas > 0 ? Number(((visitasConVentaOCotiz / visitasRealizadas) * 100).toFixed(1)) : 0;

    return {
      periodo: periodoActual,
      totalJornadas: jornadas.length,
      resumenTiempos: {
        totalHoras: Number((tiempoTotalMin / 60).toFixed(1)),
        efectivoHoras: Number((tiempoEfectivoMin / 60).toFixed(1)),
        transitoHoras: Number((tiempoTransitoMin / 60).toFixed(1)),
        detenidoHoras: Number((tiempoDetenidoMin / 60).toFixed(1)),
        distanciaTotalKm: Number(distanciaTotalKm.toFixed(1))
      },
      indicadoresEficiencia: {
        ieoPorcentaje: ieo,
        tecPorcentaje: tec,
        promedioPermanenciaVisitaMin: visitasRealizadas > 0 ? Math.round(tiempoEfectivoMin / visitasRealizadas) : 0
      },
      resumenComercial: {
        totalVisitas,
        visitasRealizadas,
        visitasNoEfectivas,
        visitasConCierre: visitasConVentaOCotiz,
        nuevosProspectos: prospectos.length,
        prospectosGanados: prospectos.filter(p => p.etapa === 'Cerrado Ganado').length
      }
    };
  }

  /**
   * Genera el ranking comercial y operativo de colaboradores
   */
  async getRankingComercialCampo(periodo = null) {
    const ahora = new Date();
    const periodoActual = periodo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const [anio, mes] = periodoActual.split('-');

    const fechaInicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
    const fechaFin = new Date(parseInt(anio), parseInt(mes), 0, 23, 59, 59, 999);

    const usuarios = await prisma.user.findMany({
      where: {
        esComercialCampo: true
      },
      select: {
        id: true,
        user: true,
        nombre: true,
        apellido: true,
        cargo: true,
        foto: true,
        jornadas: {
          where: {
            fecha: { gte: fechaInicio, lte: fechaFin },
            estado: { in: ['Finalizada', 'Cierre Automatico'] }
          }
        },
        visitasCampo: {
          where: {
            fechaProgramada: { gte: fechaInicio, lte: fechaFin },
            estado: 'Realizada'
          },
          include: { venta: true, cotizacion: true }
        },
        prospectosCampo: {
          where: {
            fechaCreacion: { gte: fechaInicio, lte: fechaFin }
          }
        }
      }
    });

    const ranking = usuarios.map(u => {
      const visitasOk = u.visitasCampo.length;
      const ventasCerradas = u.visitasCampo.filter(v => v.ventaId).length;
      const cotizacionesGeneradas = u.visitasCampo.filter(v => v.cotizacionId).length;
      const prospectosCreados = u.prospectosCampo.length;
      const horasEfectivas = u.jornadas.reduce((acc, j) => acc + (j.tiempoEfectivoMin || 0), 0) / 60;

      // Ponderación de Score de Rendimiento (0 - 100)
      const score = Math.min(100, Math.round(
        (visitasOk * 4) +
        (ventasCerradas * 15) +
        (cotizacionesGeneradas * 6) +
        (prospectosCreados * 5) +
        (horasEfectivas * 1.5)
      ));

      return {
        id: u.id,
        user: u.user,
        nombre: `${u.nombre} ${u.apellido || ''}`.trim(),
        cargo: u.cargo,
        foto: u.foto,
        visitasOk,
        ventasCerradas,
        cotizacionesGeneradas,
        prospectosCreados,
        horasEfectivas: Number(horasEfectivas.toFixed(1)),
        score
      };
    });

    // Filtrar solo colaboradores con actividad y ordenar de mayor a menor score
    return ranking
      .filter(r => r.score > 0 || r.visitasOk > 0)
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = new ProductividadService();
