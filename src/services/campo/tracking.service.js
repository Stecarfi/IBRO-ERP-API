const prisma = require('../../prisma');
const geofenceService = require('./geofence.service');

class TrackingService {
  /**
   * Procesa y almacena un ping de telemetría unitario
   */
  async registrarPing(usuarioId, data, io = null) {
    const {
      lat,
      lng,
      precision,
      velocidad = 0,
      rumbo = 0,
      bateria,
      esSimulado = false,
      redTipo = 'Online',
      jornadaId,
      timestamp = new Date()
    } = data;

    // Validación cinemática de velocidad extrema (descarte de saltos falsos)
    const velocidadNum = parseFloat(velocidad) || 0;
    const mockDetectado = esSimulado || velocidadNum > 160;
    const enMovimiento = velocidadNum > 6; // Mayor a 6 km/h se considera movimiento activo

    // 1. Guardar breadcrumb en base de datos
    const breadcrumb = await prisma.rastreoUbicacion.create({
      data: {
        usuarioId,
        jornadaId: jornadaId || null,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        precision: precision ? parseFloat(precision) : null,
        velocidad: velocidadNum,
        rumbo: rumbo ? parseFloat(rumbo) : null,
        bateria: bateria ? parseInt(bateria) : null,
        esSimulado: mockDetectado,
        enMovimiento,
        redTipo: redTipo || 'Online',
        timestamp: new Date(timestamp),
        sincronizadoEn: new Date()
      }
    });

    // 2. Actualizar posición instantánea en modelo User para compatibilidad con módulos existentes
    const nowTimestamp = Date.now();
    await prisma.user.update({
      where: { id: usuarioId },
      data: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        lastLocationUpdate: nowTimestamp
      }
    });

    // 3. Emisión en tiempo real vía Socket.io para paneles de supervisión
    if (io) {
      const userRecord = await prisma.user.findUnique({
        where: { id: usuarioId },
        select: { id: true, user: true, nombre: true, apellido: true, cargo: true, foto: true, roleId: true }
      });

      const payload = {
        usuarioId,
        user: userRecord?.user || usuarioId,
        nombre: `${userRecord?.nombre || ''} ${userRecord?.apellido || ''}`.trim(),
        cargo: userRecord?.cargo || 'Colaborador',
        foto: userRecord?.foto || null,
        roleId: userRecord?.roleId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        precision,
        velocidad: velocidadNum,
        bateria,
        enMovimiento,
        mockDetectado,
        lastLocationUpdate: nowTimestamp,
        timestamp: new Date(timestamp).toISOString()
      };

      io.emit('CAMPO_TELEMETRIA_UPDATE', payload);
      // Compatibilidad con visor radar existente
      io.emit('LOCATION_UPDATE', {
        user: userRecord?.user,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        lastLocationUpdate: nowTimestamp
      });
    }

    return breadcrumb;
  }

  /**
   * Ingesta masiva de puntos acumulados offline
   */
  async registrarBatch(usuarioId, puntos, io = null) {
    if (!Array.isArray(puntos) || puntos.length === 0) {
      return { totalProcesados: 0 };
    }

    const itemsToInsert = puntos.map(p => ({
      usuarioId,
      jornadaId: p.jornadaId || null,
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lng),
      precision: p.precision ? parseFloat(p.precision) : null,
      velocidad: parseFloat(p.velocidad || 0),
      rumbo: p.rumbo ? parseFloat(p.rumbo) : null,
      bateria: p.bateria ? parseInt(p.bateria) : null,
      esSimulado: !!p.esSimulado || (parseFloat(p.velocidad || 0) > 160),
      enMovimiento: parseFloat(p.velocidad || 0) > 6,
      redTipo: p.redTipo || 'Offline-Cached',
      timestamp: p.timestamp ? new Date(p.timestamp) : new Date(),
      sincronizadoEn: new Date()
    }));

    // Transacción masiva
    await prisma.rastreoUbicacion.createMany({
      data: itemsToInsert,
      skipDuplicates: true
    });

    // Actualizar última coordenada con el punto más reciente del lote
    const ultimoPunto = itemsToInsert.sort((a, b) => b.timestamp - a.timestamp)[0];
    if (ultimoPunto) {
      await prisma.user.update({
        where: { id: usuarioId },
        data: {
          lat: ultimoPunto.lat,
          lng: ultimoPunto.lng,
          lastLocationUpdate: Date.now()
        }
      });
    }

    // Notificar actualización general
    if (io) {
      io.emit('CAMPO_BATCH_SYNC', { usuarioId, cantidad: itemsToInsert.length });
    }

    return { totalProcesados: itemsToInsert.length };
  }

  /**
   * Consulta el recorrido cronológico de un colaborador para un día específico
   */
  async getHistorialRecorrido(usuarioId, fechaStr) {
    const fecha = fechaStr ? new Date(fechaStr) : new Date();
    const startOfDay = new Date(fecha.setHours(0, 0, 0, 0));
    const endOfDay = new Date(fecha.setHours(23, 59, 59, 999));

    const puntos = await prisma.rastreoUbicacion.findMany({
      where: {
        usuarioId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    // Calcular distancia total recorrida y detectar paradas prolongadas
    let distanciaTotalM = 0;
    const paradas = [];
    let puntoParadaInicio = null;

    for (let i = 1; i < puntos.length; i++) {
      const pAnterior = puntos[i - 1];
      const pActual = puntos[i];

      const dist = geofenceService.calcularDistanciaMetros(
        pAnterior.lat,
        pAnterior.lng,
        pActual.lat,
        pActual.lng
      );
      distanciaTotalM += dist;

      // Detección de parada (menos de 20m de desplazamiento y más de 10 min entre puntos)
      const diffMin = (new Date(pActual.timestamp) - new Date(pAnterior.timestamp)) / 60000;
      if (dist < 20 && diffMin >= 10) {
        paradas.push({
          lat: pActual.lat,
          lng: pActual.lng,
          horaInicio: pAnterior.timestamp,
          horaFin: pActual.timestamp,
          duracionMin: Math.round(diffMin)
        });
      }
    }

    return {
      usuarioId,
      fecha: startOfDay.toISOString().split('T')[0],
      totalPuntos: puntos.length,
      distanciaKm: Number((distanciaTotalM / 1000).toFixed(2)),
      paradasDetectadas: paradas,
      coordenadas: puntos.map(p => ({
        lat: p.lat,
        lng: p.lng,
        velocidad: p.velocidad,
        bateria: p.bateria,
        precision: p.precision,
        timestamp: p.timestamp,
        esSimulado: p.esSimulado
      }))
    };
  }

  /**
   * Obtiene la última posición conocida y estado de todos los colaboradores
   */
  async getUltimasUbicacionesPersonal() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        user: true,
        nombre: true,
        apellido: true,
        cargo: true,
        foto: true,
        roleId: true,
        lat: true,
        lng: true,
        lastLocationUpdate: true,
        jornadas: {
          where: { estado: { in: ['Iniciada', 'En Pausa'] } },
          orderBy: { horaInicio: 'desc' },
          take: 1,
          include: {
            visitas: {
              where: { estado: 'En Curso' },
              take: 1,
              include: { cliente: true, prospecto: true }
            }
          }
        }
      },
      where: {
        lat: { not: null },
        lng: { not: null }
      }
    });

    const ahora = Date.now();
    return users.map(u => {
      const jornadaActiva = u.jornadas[0] || null;
      const visitaEnCurso = jornadaActiva?.visitas[0] || null;

      // Estado operativo:
      // - "En Visita": Tiene una visita marcada como 'En Curso'
      // - "En Jornada": Turno iniciado
      // - "En Pausa": Turno en pausa
      // - "Inactivo": Sin jornada activa
      let estadoOperativo = 'Inactivo';
      if (visitaEnCurso) {
        estadoOperativo = 'En Visita';
      } else if (jornadaActiva) {
        estadoOperativo = jornadaActiva.estado === 'En Pausa' ? 'En Pausa' : 'En Ruta';
      }

      // Conectividad (si reportó hace menos de 5 min)
      const diffMs = ahora - (u.lastLocationUpdate || 0);
      const enVivo = diffMs < 5 * 60 * 1000;

      return {
        id: u.id,
        user: u.user,
        nombreCompleto: `${u.nombre} ${u.apellido || ''}`.trim(),
        cargo: u.cargo,
        foto: u.foto,
        roleId: u.roleId,
        lat: u.lat,
        lng: u.lng,
        lastLocationUpdate: u.lastLocationUpdate,
        enVivo,
        estadoOperativo,
        jornadaId: jornadaActiva?.id || null,
        clienteActual: visitaEnCurso?.cliente?.nom || visitaEnCurso?.prospecto?.nombreComercial || null
      };
    });
  }
}

module.exports = new TrackingService();
