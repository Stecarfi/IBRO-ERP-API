const prisma = require('../../prisma');
const geofenceService = require('./geofence.service');

class VisitasService {
  /**
   * Agenda una nueva visita para un cliente existente o prospecto
   */
  async programarVisita(usuarioId, data) {
    const {
      clienteId,
      prospectoId,
      tipoVisita = 'Comercial Prospeccion',
      fechaProgramada,
      horaEstimada = '09:00',
      compromisos = ''
    } = data;

    const count = await prisma.visitaCampo.count();
    const codigo = `VIS-${String(count + 1).padStart(5, '0')}`;

    // Asociar a jornada activa si existe hoy
    const jornadaHoy = await prisma.jornadaLaboral.findFirst({
      where: {
        usuarioId,
        estado: { in: ['Iniciada', 'En Pausa'] }
      },
      orderBy: { horaInicio: 'desc' }
    });

    const visita = await prisma.visitaCampo.create({
      data: {
        codigo,
        usuarioId,
        jornadaId: jornadaHoy?.id || null,
        clienteId: clienteId || null,
        prospectoId: prospectoId || null,
        tipoVisita,
        estado: 'Programada',
        fechaProgramada: new Date(fechaProgramada),
        horaEstimada,
        compromisos
      },
      include: {
        cliente: true,
        prospecto: true
      }
    });

    return visita;
  }

  /**
   * Obtiene la agenda de visitas del día para el usuario
   */
  async getAgendaUsuario(usuarioId, fechaStr) {
    const fecha = fechaStr ? new Date(fechaStr) : new Date();
    const startOfDay = new Date(fecha.setHours(0, 0, 0, 0));
    const endOfDay = new Date(fecha.setHours(23, 59, 59, 999));

    const visitas = await prisma.visitaCampo.findMany({
      where: {
        usuarioId,
        fechaProgramada: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        cliente: true,
        prospecto: true,
        cotizacion: true,
        venta: true
      },
      orderBy: { horaEstimada: 'asc' }
    });

    return visitas;
  }

  /**
   * Check-In geoverificado al llegar al destino
   */
  async checkIn(usuarioId, data, io = null) {
    const { visitaId, lat, lng, precision, foto, bateria } = data;

    const visita = await prisma.visitaCampo.findUnique({
      where: { id: visitaId },
      include: { cliente: true, prospecto: true }
    });

    if (!visita || visita.usuarioId !== usuarioId) {
      return { success: false, error: 'Visita no encontrada o no pertenece al usuario' };
    }

    // Determinar coordenadas objetivo del cliente o prospecto
    let targetLat = null;
    let targetLng = null;

    if (visita.cliente && visita.cliente.lat && visita.cliente.lng) {
      targetLat = visita.cliente.lat;
      targetLng = visita.cliente.lng;
    } else if (visita.prospecto && visita.prospecto.lat && visita.prospecto.lng) {
      targetLat = visita.prospecto.lat;
      targetLng = visita.prospecto.lng;
    }

    let distanciaM = 0;
    if (targetLat && targetLng) {
      distanciaM = geofenceService.calcularDistanciaMetros(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(targetLat),
        parseFloat(targetLng)
      );
    }

    const checkInHora = new Date();

    // Asociar a la jornada laboral activa actual si no la tenía
    const jornadaActiva = await prisma.jornadaLaboral.findFirst({
      where: {
        usuarioId,
        estado: { in: ['Iniciada', 'En Pausa'] }
      },
      orderBy: { horaInicio: 'desc' }
    });

    const visitaActualizada = await prisma.visitaCampo.update({
      where: { id: visitaId },
      data: {
        estado: 'En Curso',
        jornadaId: visita.jornadaId || jornadaActiva?.id || null,
        checkInHora,
        checkInLat: parseFloat(lat),
        checkInLng: parseFloat(lng),
        checkInPrecision: precision ? parseFloat(precision) : null,
        checkInDistanciaM: distanciaM,
        checkInFoto: foto || null
      },
      include: {
        cliente: true,
        prospecto: true
      }
    });

    // Notificar en vivo al mapa gerencial
    if (io) {
      io.emit('CAMPO_CHECKIN_EVENT', {
        visitaId,
        usuarioId,
        clienteNombre: visita.cliente?.nom || visita.prospecto?.nombreComercial || 'Cliente',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        distanciaM,
        alertaDesviacion: distanciaM > 100,
        hora: checkInHora.toISOString()
      });
    }

    return {
      success: true,
      visita: visitaActualizada,
      alertaDesviacion: distanciaM > 100,
      distanciaMetros: distanciaM
    };
  }

  /**
   * Check-Out de la visita con balance de compromisos y firmas
   */
  async checkOut(usuarioId, data, io = null) {
    const {
      visitaId,
      lat,
      lng,
      resultadoResumen,
      compromisos = '',
      proximaVisita = null,
      contactoAtendio = '',
      firmaCliente = null,
      evidencias = [],
      motivoNoEfectiva = null,
      cotizacionId = null,
      ventaId = null
    } = data;

    const visita = await prisma.visitaCampo.findUnique({ where: { id: visitaId } });
    if (!visita || visita.usuarioId !== usuarioId) {
      return { success: false, error: 'Visita no encontrada o no pertenece al usuario' };
    }

    const checkOutHora = new Date();
    const inicio = visita.checkInHora ? new Date(visita.checkInHora) : checkOutHora;
    const duracionMin = Math.max(1, Math.round((checkOutHora - inicio) / 60000));

    const estadoFinal = motivoNoEfectiva ? 'No Efectiva' : 'Realizada';

    const visitaFinalizada = await prisma.visitaCampo.update({
      where: { id: visitaId },
      data: {
        estado: estadoFinal,
        checkOutHora,
        checkOutLat: parseFloat(lat),
        checkOutLng: parseFloat(lng),
        duracionMin,
        resultadoResumen,
        compromisos,
        proximaVisita: proximaVisita ? new Date(proximaVisita) : null,
        contactoAtendio,
        firmaCliente,
        evidencias: Array.isArray(evidencias) ? evidencias : [],
        motivoNoEfectiva,
        cotizacionId,
        ventaId
      },
      include: {
        cliente: true,
        prospecto: true
      }
    });

    // Si generó próxima visita sugerida, agendarla automáticamente
    if (proximaVisita) {
      const count = await prisma.visitaCampo.count();
      await prisma.visitaCampo.create({
        data: {
          codigo: `VIS-${String(count + 1).padStart(5, '0')}`,
          usuarioId,
          clienteId: visita.clienteId,
          prospectoId: visita.prospectoId,
          tipoVisita: 'Comercial Seguimiento',
          estado: 'Programada',
          fechaProgramada: new Date(proximaVisita),
          compromisos: `Seguimiento automático pactado en visita ${visita.codigo}: ${compromisos}`
        }
      });
    }

    if (io) {
      io.emit('CAMPO_CHECKOUT_EVENT', {
        visitaId,
        usuarioId,
        duracionMin,
        estado: estadoFinal
      });
    }

    return { success: true, visita: visitaFinalizada };
  }

  /**
   * Registro rápido de prospecto en campo
   */
  async crearProspecto(usuarioId, data) {
    const count = await prisma.prospectoCampo.count();
    const codigo = `PROS-${String(count + 1).padStart(5, '0')}`;

    const prospecto = await prisma.prospectoCampo.create({
      data: {
        codigo,
        nombreComercial: data.nombreComercial,
        razonSocial: data.razonSocial || null,
        nitRut: data.nitRut || null,
        contactoNombre: data.contactoNombre,
        contactoTelefono: data.contactoTelefono,
        contactoCorreo: data.contactoCorreo || null,
        direccion: data.direccion,
        barrio: data.barrio || null,
        ciudad: data.ciudad || 'Barranquilla',
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        origen: data.origen || 'En Frio / Puerta a Puerta',
        interesDetalle: data.interesDetalle || null,
        presupuestoEst: data.presupuestoEst ? parseFloat(data.presupuestoEst) : 0,
        probabilidadPct: data.probabilidadPct ? parseInt(data.probabilidadPct) : 20,
        creadoPorId: usuarioId
      }
    });

    return prospecto;
  }

  /**
   * Convierte un prospecto a Cliente formal del ERP
   */
  async convertirACliente(prospectoId, usuarioId) {
    const prospecto = await prisma.prospectoCampo.findUnique({ where: { id: prospectoId } });
    if (!prospecto) throw new Error('Prospecto no encontrado');

    const nit = prospecto.nitRut || `NIT-${Date.now().toString().slice(-8)}`;
    const nuevoCliente = await prisma.cliente.create({
      data: {
        id: `cli_${Date.now()}`,
        doc_tipo: 'NIT',
        doc: nit,
        nom: prospecto.nombreComercial,
        tipo_cliente: 'Comercial',
        tel: prospecto.contactoTelefono,
        correo: prospecto.contactoCorreo || 'comercial@campo.com',
        direccion: prospecto.direccion,
        barrio: prospecto.barrio,
        ciudad: prospecto.ciudad,
        contactoComercial: prospecto.contactoNombre,
        owner: usuarioId
      }
    });

    await prisma.prospectoCampo.update({
      where: { id: prospectoId },
      data: {
        etapa: 'Cerrado Ganado',
        clienteId: nuevoCliente.id
      }
    });

    return nuevoCliente;
  }
}

module.exports = new VisitasService();
