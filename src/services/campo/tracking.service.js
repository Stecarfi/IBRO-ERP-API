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
        isOnline: true,
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
    const ahoraDate = new Date();
    const startOfDay = new Date(ahoraDate);
    startOfDay.setHours(0, 0, 0, 0);

    const users = await prisma.user.findMany({
      where: {
        esComercialCampo: true,
        esDelegadoGerencia: false,
        user: { not: 'admin' },
        roleId: { not: '1' },
        NOT: [
          { cargo: { contains: 'director', mode: 'insensitive' } },
          { cargo: { contains: 'delegad', mode: 'insensitive' } },
          { cargo: { contains: 'gerent', mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        user: true,
        nombre: true,
        apellido: true,
        cargo: true,
        foto: true,
        roleId: true,
        isOnline: true,
        lat: true,
        lng: true,
        lastLocationUpdate: true,
        jornadas: {
          where: {
            estado: { in: ['Iniciada', 'En Pausa', 'En Ruta'] },
            horaInicio: { gte: startOfDay }
          },
          orderBy: { horaInicio: 'desc' },
          take: 1,
          include: {
            visitas: {
              where: { estado: 'En Curso' },
              take: 1,
              include: { cliente: true, prospecto: true, clienteExterno: true }
            },
            ubicaciones: {
              orderBy: { timestamp: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    const ahora = Date.now();
    return users.map(u => {
      const jornadaActiva = u.jornadas[0] || null;
      const visitaEnCurso = jornadaActiva?.visitas[0] || null;
      const ultimoPing = jornadaActiva?.ubicaciones?.[0] || null;

      // Inactividad máxima para considerar ping en vivo: 5 minutos (Cero simulación)
      const updateTime = ultimoPing?.timestamp
        ? new Date(ultimoPing.timestamp).getTime()
        : (u.lastLocationUpdate ? Number(u.lastLocationUpdate) : null);

      const diffMs = updateTime ? (ahora - updateTime) : Infinity;
      const pingReciente = Boolean(updateTime && diffMs < 5 * 60 * 1000);

      let estadoOperativo = 'Inactivo';
      let estado = 'Fuera de Turno';
      let enVivo = false;

      if (!jornadaActiva) {
        estadoOperativo = 'Inactivo';
        estado = 'Fuera de Turno';
        enVivo = false;
      } else if (visitaEnCurso) {
        estadoOperativo = 'en_visita';
        estado = pingReciente ? 'En Visita' : 'En Visita (Sin Señal)';
        enVivo = pingReciente;
      } else if (jornadaActiva.estado === 'En Pausa') {
        estadoOperativo = 'en_pausa';
        estado = 'En Pausa';
        enVivo = pingReciente;
      } else {
        estadoOperativo = 'en_jornada';
        estado = pingReciente ? 'En Ruta' : 'En Ruta (Sin Señal)';
        enVivo = pingReciente;
      }

      return {
        id: u.id,
        user: u.user,
        nombreCompleto: `${u.nombre} ${u.apellido || ''}`.trim(),
        cargo: u.cargo,
        foto: u.foto,
        roleId: u.roleId,
        isOnline: Boolean(jornadaActiva && pingReciente),
        lat: ultimoPing?.lat ?? u.lat,
        lng: ultimoPing?.lng ?? u.lng,
        lastLocationUpdate: updateTime,
        enVivo,
        estadoOperativo,
        estado,
        jornadaId: jornadaActiva?.id || null,
        bateria: ultimoPing?.bateria ?? jornadaActiva?.bateriaInicio ?? 90,
        velocidad: ultimoPing?.velocidad ? Math.round(Number(ultimoPing.velocidad)) : 0,
        clienteActual: visitaEnCurso?.clienteExterno?.nombre || visitaEnCurso?.cliente?.nom || visitaEnCurso?.prospecto?.nombreComercial || null
      };
    });
  }
}

module.exports = new TrackingService();
