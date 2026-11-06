const prisma = require('../../prisma');
const geofenceService = require('./geofence.service');

const getColombiaDayBounds = (date = new Date()) => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    const colombiaStr = date.trim();
    return {
      startOfDay: new Date(`${colombiaStr}T00:00:00-05:00`),
      endOfDay: new Date(`${colombiaStr}T23:59:59.999-05:00`),
      colombiaStr
    };
  }
  const d = date instanceof Date ? date : new Date(date);
  const colombiaStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
  const startOfDay = new Date(`${colombiaStr}T00:00:00-05:00`);
  const endOfDay = new Date(`${colombiaStr}T23:59:59.999-05:00`);
  return { startOfDay, endOfDay, colombiaStr };
};

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

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const velocidadNum = parseFloat(velocidad) || 0;
    const mockDetectado = esSimulado || velocidadNum > 160;
    const enMovimiento = velocidadNum > 6;

    // Auto-vincular con la jornada activa de hoy si no se envió jornadaId
    let resolvedJornadaId = jornadaId || null;
    try {
      const { startOfDay } = getColombiaDayBounds(new Date());
      const jActiva = await prisma.jornadaLaboral.findFirst({
        where: {
          usuarioId,
          horaInicio: { gte: startOfDay },
          estado: { in: ['Iniciada', 'En Pausa', 'En Ruta', 'Activa'] }
        },
        orderBy: { horaInicio: 'desc' }
      });
      if (jActiva) {
        if (!resolvedJornadaId) resolvedJornadaId = jActiva.id;
        // Actualizar distancia acumulada en vivo si hay movimiento válido
        if (!Number.isNaN(latNum) && !Number.isNaN(lngNum) && (latNum !== 0 || lngNum !== 0)) {
          const ultimoPuntoJornada = await prisma.rastreoUbicacion.findFirst({
            where: { jornadaId: jActiva.id },
            orderBy: { timestamp: 'desc' }
          });
          const refLat = ultimoPuntoJornada?.lat || jActiva.latInicio;
          const refLng = ultimoPuntoJornada?.lng || jActiva.lngInicio;
          if (refLat && refLng) {
            const distM = geofenceService.calcularDistanciaMetros(refLat, refLng, latNum, lngNum);
            if (distM >= 15 && distM < 25000) {
              const nuevaDistKm = Number(((Number(jActiva.distanciaKm) || 0) + (distM / 1000)).toFixed(2));
              const durMin = Math.max(1, Math.round((Date.now() - new Date(jActiva.horaInicio).getTime()) / 60000));
              await prisma.jornadaLaboral.update({
                where: { id: jActiva.id },
                data: {
                  distanciaKm: nuevaDistKm,
                  tiempoTotalMin: durMin
                }
              }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {}

    // 1. Guardar breadcrumb en base de datos
    const breadcrumb = await prisma.rastreoUbicacion.create({
      data: {
        usuarioId,
        jornadaId: resolvedJornadaId,
        lat: latNum,
        lng: lngNum,
        precision: precision ? parseFloat(precision) : null,
        velocidad: velocidadNum,
        rumbo: rumbo ? parseFloat(rumbo) : null,
        bateria: bateria != null && bateria !== '' ? parseInt(bateria) : null,
        esSimulado: mockDetectado,
        enMovimiento,
        redTipo: redTipo || 'Online',
        timestamp: new Date(timestamp),
        sincronizadoEn: new Date()
      }
    });

    // 2. Actualizar posición instantánea en modelo User para compatibilidad con todos los módulos
    const nowTimestamp = Date.now();
    await prisma.user.update({
      where: { id: usuarioId },
      data: {
        isOnline: true,
        lat: latNum,
        lng: lngNum,
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
        lat: latNum,
        lng: lngNum,
        precision,
        velocidad: velocidadNum,
        bateria,
        enMovimiento,
        mockDetectado,
        lastLocationUpdate: nowTimestamp,
        timestamp: new Date(timestamp).toISOString()
      };

      io.emit('CAMPO_TELEMETRIA_UPDATE', payload);
      io.emit('LOCATION_UPDATE', {
        user: userRecord?.user,
        usuarioId,
        lat: latNum,
        lng: lngNum,
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

    await prisma.rastreoUbicacion.createMany({
      data: itemsToInsert,
      skipDuplicates: true
    });

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

    if (io) {
      io.emit('CAMPO_BATCH_SYNC', { usuarioId, cantidad: itemsToInsert.length });
    }

    return { totalProcesados: itemsToInsert.length };
  }

  /**
   * Consulta el recorrido cronológico de un colaborador para un día específico
   */
  async getHistorialRecorrido(usuarioId, fechaStr) {
    const { startOfDay, endOfDay } = getColombiaDayBounds(fechaStr || new Date());

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

    let distanciaTotalM = 0;
    const paradas = [];

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
    const { startOfDay } = getColombiaDayBounds(new Date());

    const users = await prisma.user.findMany({
      where: { isLocked: false, esComercialCampo: true, esDelegadoGerencia: false, user: { not: 'admin' }, roleId: { not: '1' } },
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
          orderBy: { horaInicio: 'desc' },
          take: 3,
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

    const userIds = users.map(u => u.id);
    const ultimosRastreos = userIds.length > 0
      ? await prisma.rastreoUbicacion.findMany({
          where: { usuarioId: { in: userIds } },
          orderBy: { timestamp: 'desc' },
          take: 100
        }).catch(() => [])
      : [];
    const ultimoPingPorUsuario = {};
    for (const r of ultimosRastreos) {
      if (r.usuarioId && !ultimoPingPorUsuario[r.usuarioId]) {
        ultimoPingPorUsuario[r.usuarioId] = r;
      }
    }

    const ahora = Date.now();
    return users.map(u => {
      const jornadaActiva = (u.jornadas || []).find(j =>
        ['Iniciada', 'En Pausa', 'En Ruta', 'Activa'].includes(j.estado) &&
        new Date(j.horaInicio) >= startOfDay
      ) || null;
      const ultimaJornada = (u.jornadas || [])[0] || null;
      const visitaEnCurso = jornadaActiva?.visitas?.[0] || null;
      const ultimoPing = ultimoPingPorUsuario[u.id] || jornadaActiva?.ubicaciones?.[0] || null;

      // Resolver coordenada GPS más reciente entre ping, última jornada y User
      const candidatosGps = [];
      if (ultimoPing?.lat && ultimoPing?.lng) {
        candidatosGps.push({
          lat: Number(ultimoPing.lat),
          lng: Number(ultimoPing.lng),
          ts: new Date(ultimoPing.timestamp).getTime()
        });
      }
      if (ultimaJornada?.latFin && ultimaJornada?.lngFin && ultimaJornada?.horaFin) {
        candidatosGps.push({
          lat: Number(ultimaJornada.latFin),
          lng: Number(ultimaJornada.lngFin),
          ts: new Date(ultimaJornada.horaFin).getTime()
        });
      }
      if (ultimaJornada?.latInicio && ultimaJornada?.lngInicio && ultimaJornada?.horaInicio) {
        candidatosGps.push({
          lat: Number(ultimaJornada.latInicio),
          lng: Number(ultimaJornada.lngInicio),
          ts: new Date(ultimaJornada.horaInicio).getTime()
        });
      }
      if (u.lat && u.lng) {
        candidatosGps.push({
          lat: Number(u.lat),
          lng: Number(u.lng),
          ts: u.lastLocationUpdate ? Number(u.lastLocationUpdate) : 0
        });
      }
      candidatosGps.sort((a, b) => b.ts - a.ts);
      const mejorGps = candidatosGps[0] || null;

      const updateTime = mejorGps?.ts || (u.lastLocationUpdate ? Number(u.lastLocationUpdate) : null);
      const diffMs = updateTime ? (ahora - updateTime) : Infinity;
      const pingReciente = Boolean(updateTime && diffMs < 15 * 60 * 1000);

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
        lat: mejorGps ? mejorGps.lat : u.lat,
        lng: mejorGps ? mejorGps.lng : u.lng,
        lastLocationUpdate: updateTime,
        enVivo,
        estadoOperativo,
        estado,
        jornadaId: jornadaActiva?.id || null,
        ultimaJornadaFecha: ultimaJornada?.horaInicio || null,
        ultimaJornadaFin: ultimaJornada?.horaFin || null,
        ultimaJornadaDuracionMin: ultimaJornada?.tiempoTotalMin || null,
        ultimaJornadaDistanciaKm: ultimaJornada?.distanciaKm || null,
        bateria: (pingReciente && ultimoPing?.bateria != null)
          ? Number(ultimoPing.bateria)
          : (jornadaActiva?.bateriaInicio != null ? Number(jornadaActiva.bateriaInicio) : null),
        velocidad: (pingReciente && ultimoPing?.velocidad != null)
          ? Math.round(Number(ultimoPing.velocidad))
          : 0,
        clienteActual: visitaEnCurso?.clienteExterno?.nombre || visitaEnCurso?.cliente?.nom || visitaEnCurso?.prospecto?.nombreComercial || null
      };
    });
  }
}

module.exports = new TrackingService();
