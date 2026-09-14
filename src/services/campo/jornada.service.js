const prisma = require('../../prisma');
const geofenceService = require('./geofence.service');

class JornadaService {
  /**
   * Apertura un nuevo turno de trabajo de campo
   */
  async iniciarJornada(usuarioId, data) {
    // 1. Verificar si ya tiene una jornada activa
    const jornadaPrevia = await prisma.jornadaLaboral.findFirst({
      where: {
        usuarioId,
        estado: { in: ['Iniciada', 'En Pausa'] }
      },
      orderBy: { horaInicio: 'desc' }
    });

    if (jornadaPrevia) {
      return { success: false, error: 'Ya tienes una jornada activa en curso', jornada: jornadaPrevia };
    }

    const {
      lat,
      lng,
      direccionInicio = '',
      fotoInicio = null,
      odometroInicio = null,
      bateriaInicio = null,
      dispositivo = 'Web / Móvil'
    } = data;

    const nuevaJornada = await prisma.jornadaLaboral.create({
      data: {
        usuarioId,
        latInicio: parseFloat(lat),
        lngInicio: parseFloat(lng),
        direccionInicio,
        fotoInicio,
        odometroInicio: odometroInicio ? parseFloat(odometroInicio) : null,
        bateriaInicio: bateriaInicio ? parseInt(bateriaInicio) : null,
        dispositivo,
        estado: 'Iniciada',
        horaInicio: new Date(),
        fecha: new Date()
      }
    });

    // Registrar primer breadcrumb
    await prisma.rastreoUbicacion.create({
      data: {
        usuarioId,
        jornadaId: nuevaJornada.id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        bateria: bateriaInicio ? parseInt(bateriaInicio) : null,
        timestamp: new Date()
      }
    });

    return { success: true, jornada: nuevaJornada };
  }

  /**
   * Registra una pausa o descanso
   */
  async iniciarPausa(usuarioId, data) {
    const { jornadaId, tipo, motivo = '', lat, lng } = data;

    const jornada = await prisma.jornadaLaboral.findUnique({ where: { id: jornadaId } });
    if (!jornada || jornada.usuarioId !== usuarioId || jornada.estado !== 'Iniciada') {
      return { success: false, error: 'Jornada no encontrada o no está en estado iniciada' };
    }

    const pausa = await prisma.pausaJornada.create({
      data: {
        jornadaId,
        tipo: tipo || 'Descanso',
        motivo,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        horaInicio: new Date()
      }
    });

    await prisma.jornadaLaboral.update({
      where: { id: jornadaId },
      data: { estado: 'En Pausa' }
    });

    return { success: true, pausa };
  }

  /**
   * Reanuda la jornada finalizando la pausa activa
   */
  async reanudarPausa(usuarioId, data) {
    const { pausaId } = data;

    const pausa = await prisma.pausaJornada.findUnique({
      where: { id: pausaId },
      include: { jornada: true }
    });

    if (!pausa || pausa.jornada.usuarioId !== usuarioId) {
      return { success: false, error: 'Pausa no encontrada' };
    }

    const ahora = new Date();
    const duracionMin = Math.max(1, Math.round((ahora - new Date(pausa.horaInicio)) / 60000));

    await prisma.pausaJornada.update({
      where: { id: pausaId },
      data: {
        horaFin: ahora,
        duracionMin
      }
    });

    const jornadaActualizada = await prisma.jornadaLaboral.update({
      where: { id: pausa.jornadaId },
      data: { estado: 'Iniciada' }
    });

    return { success: true, jornada: jornadaActualizada };
  }

  /**
   * Cierra el turno de trabajo y computa métricas consolidadas
   */
  async finalizarJornada(usuarioId, data) {
    const {
      jornadaId,
      lat,
      lng,
      direccionFin = '',
      fotoFin = null,
      odometroFin = null,
      bateriaFin = null,
      observaciones = ''
    } = data;

    const jornada = await prisma.jornadaLaboral.findUnique({
      where: { id: jornadaId },
      include: {
        pausas: true,
        ubicaciones: { orderBy: { timestamp: 'asc' } },
        visitas: true
      }
    });

    if (!jornada || jornada.usuarioId !== usuarioId) {
      return { success: false, error: 'Jornada no encontrada o usuario no autorizado' };
    }

    // 1. VALIDACIÓN OBLIGATORIA: No permitir finalizar la jornada si existen visitas abiertas
    const visitasAbiertas = (jornada.visitas || []).filter(v => v.estado === 'En Curso' || (v.checkInHora && !v.checkOutHora));
    if (visitasAbiertas.length > 0) {
      return {
        success: false,
        error: `No es posible finalizar la jornada laboral porque tiene ${visitasAbiertas.length} visita(s) en curso abiertas. Debe registrar el resultado y finalizar cada visita antes de cerrar su turno.`
      };
    }

    const horaFin = new Date();
    const tiempoTotalMin = Math.round((horaFin - new Date(jornada.horaInicio)) / 60000);

    // Calcular tiempo total en pausas
    const tiempoPausasMin = jornada.pausas.reduce((acc, p) => {
      const fin = p.horaFin ? new Date(p.horaFin) : horaFin;
      return acc + Math.round((fin - new Date(p.horaInicio)) / 60000);
    }, 0);

    // Calcular tiempo efectivo de visitas (checkIn a checkOut)
    const tiempoEfectivoMin = jornada.visitas.reduce((acc, v) => {
      return acc + (v.duracionMin || 0);
    }, 0);

    // Calcular distancia recorrida según breadcrumbs
    let distanciaTotalM = 0;
    const puntos = jornada.ubicaciones;
    for (let i = 1; i < puntos.length; i++) {
      distanciaTotalM += geofenceService.calcularDistanciaMetros(
        puntos[i - 1].lat,
        puntos[i - 1].lng,
        puntos[i].lat,
        puntos[i].lng
      );
    }
    const distanciaKm = Number((distanciaTotalM / 1000).toFixed(2));

    // Tiempo tránsito aproximado
    const tiempoTransitoMin = Math.max(0, Math.round(distanciaKm * 3.5)); // ~17 km/h promedio en ciudad
    const tiempoDetenidoMin = Math.max(0, tiempoTotalMin - (tiempoEfectivoMin + tiempoPausasMin + tiempoTransitoMin));

    // Contabilizar totales ejecutados
    const totalVisitas = jornada.visitas.length;
    let totalActividades = 0;
    try {
      totalActividades = await prisma.actividadCampo.count({
        where: {
          usuarioId,
          OR: [
            { jornadaId },
            {
              createdAt: {
                gte: new Date(new Date(jornada.horaInicio).setHours(0, 0, 0, 0)),
                lte: horaFin
              }
            }
          ]
        }
      });
    } catch (e) {}

    const jornadaCerrada = await prisma.jornadaLaboral.update({
      where: { id: jornadaId },
      data: {
        horaFin,
        latFin: parseFloat(lat),
        lngFin: parseFloat(lng),
        direccionFin,
        fotoFin,
        odometroFin: odometroFin ? parseFloat(odometroFin) : null,
        bateriaFin: bateriaFin ? parseInt(bateriaFin) : null,
        estado: 'Finalizada',
        tiempoTotalMin,
        tiempoEfectivoMin,
        tiempoDetenidoMin,
        tiempoTransitoMin,
        distanciaKm,
        totalVisitas,
        totalActividades,
        observaciones
      }
    });

    return { success: true, jornada: jornadaCerrada };
  }

  /**
   * Obtiene la jornada activa del usuario en sesión
   */
  async getJornadaActiva(usuarioId) {
    const jornada = await prisma.jornadaLaboral.findFirst({
      where: {
        usuarioId,
        estado: { in: ['Iniciada', 'En Pausa'] }
      },
      include: {
        pausas: { where: { horaFin: null } },
        visitas: {
          orderBy: { fechaProgramada: 'asc' },
          include: { cliente: true, prospecto: true }
        }
      },
      orderBy: { horaInicio: 'desc' }
    });

    return jornada;
  }

  /**
   * Tarea nocturna para cerrar jornadas abiertas huérfanas
   */
  async cerrarJornadasHuerfanas() {
    const hoy = new Date();
    const limite = new Date(hoy.setHours(0, 0, 0, 0));

    const abiertas = await prisma.jornadaLaboral.findMany({
      where: {
        horaInicio: { lt: limite },
        estado: { in: ['Iniciada', 'En Pausa'] }
      }
    });

    for (const j of abiertas) {
      await prisma.jornadaLaboral.update({
        where: { id: j.id },
        data: {
          estado: 'Cierre Automatico',
          horaFin: new Date(new Date(j.horaInicio).setHours(18, 0, 0, 0)),
          observaciones: 'Cierre automático por finalización de ciclo diario sin reporte manual'
        }
      });
    }

    return { totalCerradas: abiertas.length };
  }
}

module.exports = new JornadaService();
