const prisma = require('../prisma');
const bcrypt = require('bcryptjs');
const { sanitizeBackendForPrisma } = require('../validators');

const safeDate = (val) => {
  if (!val) return new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
};

class SyncService {
  async getDb(requestingUser = null) {
    const users = await prisma.user.findMany({
      select: {
        id: true, nombre: true, apellido: true, cedula: true, tipoDoc: true,
        correo: true, cargo: true, telefono: true, observaciones: true,
        user: true, roleId: true, meta_u: true, ejec_u: true, meta_p: true,
        ejec_p: true, soundsEnabled: true, cumpleanos: true,
        habeasDataAccepted: true, failedLoginAttempts: true, isLocked: true,
        lastLogin: true, isOnline: true, foto: true, firma: true, lat: true, lng: true,
        lastLocationUpdate: true, codigoAsesor: true,
        esComercialCampo: true, esDelegadoGerencia: true
      },
      orderBy: { id: 'asc' }
    });
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' } });
    const clientes = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
    const inventarioRaw = await prisma.inventario.findMany({ orderBy: { id: 'asc' } });
    const inventario = inventarioRaw.map(inv => {
      const ext = (inv.datosExt && typeof inv.datosExt === 'object') ? inv.datosExt : {};
      return {
        ...inv,
        ...ext
      };
    });
    
    // Mapear Ventas (incluyendo Cliente y Producto)
    const ventasRaw = await prisma.venta.findMany({
      take: 50,
      include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
      orderBy: { id: 'desc' }
    });
    ventasRaw.reverse();
    const ventas = ventasRaw.map(v => {
      const meta = (v.equipos && typeof v.equipos === 'object' && !Array.isArray(v.equipos) && v.equipos._meta) ? v.equipos._meta : {};
      const equiposList = (v.equipos && typeof v.equipos === 'object' && !Array.isArray(v.equipos) && Array.isArray(v.equipos.items)) ? v.equipos.items : (Array.isArray(v.equipos) ? v.equipos : []);

      return {
        id: v.id,
        fecha: v.fecha,
        fechaIso: v.fechaIso,
        venceGarantiaIso: v.venceGarantiaIso,
        mesesGarantia: v.mesesGarantia,
        vendedor: v.vendedor?.user || '',
        vendedorId: v.vendedorId,
        clienteId: v.clienteId,
        docCli: v.cliente?.doc || meta.clienteNit || '',
        cliente: v.cliente?.nom || meta.clienteNombre || '',
        clienteNombre: meta.clienteNombre || v.cliente?.nom || '',
        clienteNit: meta.clienteNit || v.cliente?.doc || '',
        clienteDireccion: meta.clienteDireccion || v.cliente?.direccion || '',
        clienteTelefono: meta.clienteTelefono || v.cliente?.tel || '',
        clienteEmail: meta.clienteEmail || v.cliente?.correo || '',
        items: v.items.map(i => ({
          productoId: i.productoId,
          producto: i.producto?.ref || '',
          cant: i.cant,
          desc: i.desc,
          precioUnitario: i.precioUnitario,
          serialEquipo: i.serialEquipo
        })),
        idProd: v.items[0]?.productoId || null,
        producto: v.items[0]?.producto?.ref || null,
        cant: v.items.reduce((acc, i) => acc + i.cant, 0),
        desc: v.items.reduce((acc, i) => acc + i.desc, 0),
        precioUnitario: v.items[0]?.precioUnitario || null,
        serialEquipo: v.items[0]?.serialEquipo || null,
        metodoPago: v.metodoPago,
        total: v.total,
        comisionistaId: v.comisionistaId,
        comisionistaNombre: v.comisionistaNombre,
        comisionistaPct: v.comisionistaPct,
        comisionistaValor: v.comisionistaValor,
        tipo_precio: v.tipo_precio,
        lockedBy: v.lockedBy,
        vendedorNombre: v.vendedorNombre || v.vendedor?.nombre || '',
        vendedorCargo: v.vendedorCargo || v.vendedor?.cargo || '',
        vendedorEmail: v.vendedorEmail || v.vendedor?.correo || '',
        vendedorMovil: v.vendedorMovil || v.vendedor?.telefono || '',
        vendedorCodigoAsesor: v.vendedorCodigoAsesor || v.vendedor?.codigoAsesor || '',
        equipos: equiposList,
        materiales: v.materiales || [],
        numPedido: meta.numPedido || (v.id.startsWith('PED-') ? v.id : 'PED-' + v.id.slice(-4)),
        ...meta
      };
    });

    // Mapear PQRS
    const pqrsRaw = await prisma.pQR.findMany({
      include: { cliente: true, usuarioAsignado: true },
      orderBy: { id: 'asc' }
    });
    const pqrs = pqrsRaw.map(p => ({
      id: p.id,
      clienteId: p.clienteId,
      fecha: p.fecha,
      limiteIso: p.limiteIso,
      docCli: p.cliente?.doc || '',
      cliente: p.cliente?.nom || '',
      tipo: p.tipo,
      detalle: p.detalle,
      evidencia: p.evidencia,
      fileUrl: p.fileUrl,
      estado: p.estado,
      satisfecho: p.satisfecho,
      lockedBy: p.lockedBy,
      radicado: p.radicado,
      hechos: p.hechos,
      solicitudes: p.solicitudes,
      evidencias: typeof p.evidencias === 'string' ? p.evidencias : JSON.stringify(p.evidencias || []),
      aplicaGarantia: p.aplicaGarantia,
      tratamientoGarantia: p.tratamientoGarantia,
      terminoLegal: p.terminoLegal,
      fechaCierre: p.fechaCierre,
      inventarioId: p.inventarioId,
      ventaId: p.ventaId,
      cotizacionId: p.cotizacionId,
      trazabilidad: typeof p.trazabilidad === 'string' ? p.trazabilidad : JSON.stringify(p.trazabilidad || []),
      usuarioAsignadoId: p.usuarioAsignadoId || null,
      usuarioAsignado: p.usuarioAsignado?.user || '',
      usuarioAsignadoNombre: p.usuarioAsignado ? `${p.usuarioAsignado.nombre} ${p.usuarioAsignado.apellido || ''}`.trim() : ''
    }));

    // Mapear Servicios Técnicos
    const serviciosRaw = await prisma.servicio.findMany({
      include: { cliente: true, tecnico: true },
      orderBy: { id: 'asc' }
    });
    const servicios = serviciosRaw.map(s => ({
      id: s.id,
      docCli: s.cliente?.doc || '',
      cliente: s.cliente?.nom || '',
      fechaProg: s.fechaProg,
      tipo: s.tipo,
      obs: s.obs,
      estado: s.estado,
      obsAdmin: s.obsAdmin,
      lockedBy: s.lockedBy,
      tecnicoId: s.tecnicoId || null,
      tecnico: s.tecnico?.user || '',
      tecnicoNombre: s.tecnico ? `${s.tecnico.nombre} ${s.tecnico.apellido || ''}`.trim() : '',
      equipoDetalle: s.equipoDetalle || '',
      obsRecepcion: s.obsRecepcion || '',
      obsDiagnostico: s.obsDiagnostico || '',
      obsCotizacion: s.obsCotizacion || '',
      obsEjecucion: s.obsEjecucion || '',
      obsCalidad: s.obsCalidad || '',
      fechaCreacion: s.fechaCreacion || '',
      fechaIso: s.fechaIso || '',
      radicado: s.radicado,
      inventarioId: s.inventarioId,
      ventaId: s.ventaId,
      cotizacionId: s.cotizacionId,
      etapaActual: s.etapaActual,
      evidencias: s.evidencias,
      trazabilidad: s.trazabilidad,
      aplicaGarantia: s.aplicaGarantia,
      costoServicio: s.costoServicio
    }));

    const solicitudesRaw = await prisma.solicitud.findMany({
      include: { asesor: true },
      orderBy: { id: 'asc' }
    });
    const solicitudes = solicitudesRaw.map(s => ({
      id: s.id,
      fecha: s.fecha ? (typeof s.fecha === 'string' ? s.fecha : s.fecha.toISOString()) : '',
      asesorId: s.asesorId,
      asesor: s.asesor?.user || '',
      nombreAsesor: s.nombreAsesor || (s.asesor ? `${s.asesor.nombre} ${s.asesor.apellido || ''}`.trim() : ''),
      tipo: s.tipo,
      detalle: s.detalle || '',
      evidencia: s.evidencia || null,
      fileUrl: s.fileUrl || null,
      estado: s.estado,
      lockedBy: s.lockedBy || null,
      comentario: s.comentario || '',
      fechaRadicado: s.fechaRadicado ? (typeof s.fechaRadicado === 'string' ? s.fechaRadicado : s.fechaRadicado.toISOString()) : ''
    }));

    const procesosDisciplinariosRaw = await prisma.procesoDisciplinario.findMany({
      include: { asesor: true, jefe: true },
      orderBy: { id: 'asc' }
    });
    const procesosDisciplinarios = procesosDisciplinariosRaw.map(p => ({
      id: p.id,
      fecha: p.fecha ? (typeof p.fecha === 'string' ? p.fecha : p.fecha.toISOString()) : '',
      asesorId: p.asesorId,
      asesor: p.asesor?.user || '',
      asesorNombre: p.asesor ? `${p.asesor.nombre} ${p.asesor.apellido || ''}`.trim() : '',
      jefeId: p.jefeId || null,
      jefe: p.jefe?.user || (p.jefeId ? '' : 'Admin'),
      jefeNombre: p.jefe ? `${p.jefe.nombre} ${p.jefe.apellido || ''}`.trim() : '',
      falta: p.falta || 'Falta',
      obs: p.obs || '',
      etapa: p.etapa || 1,
      descargo: p.descargo || '',
      sancion: p.sancion || '',
      diasSuspension: p.diasSuspension || 0,
      renunciaTerminos: p.renunciaTerminos || false,
      timestampEtapa: p.timestampEtapa ? (typeof p.timestampEtapa === 'string' ? p.timestampEtapa : p.timestampEtapa.toISOString()) : '',
      lockedBy: p.lockedBy || null,
      evidencias: p.evidencias || []
    }));

    const evaluacionesRaw = await prisma.evaluacion.findMany({
      include: { evaluador: true, evaluado: true },
      orderBy: { id: 'asc' }
    });
    const evaluaciones = evaluacionesRaw.map(ev => ({
      id: ev.id,
      fecha: ev.fecha ? (typeof ev.fecha === 'string' ? ev.fecha : ev.fecha.toISOString()) : '',
      evaluadorId: ev.evaluadorId || null,
      evaluador: ev.evaluador?.user || '',
      evaluadorNombre: ev.evaluador ? `${ev.evaluador.nombre} ${ev.evaluador.apellido || ''}`.trim() : '',
      evaluadoId: ev.evaluadoId || null,
      evaluado: ev.evaluado?.user || ev.empleado || '',
      evaluadoNombre: ev.evaluadoNombre || (ev.evaluado ? `${ev.evaluado.nombre} ${ev.evaluado.apellido || ''}`.trim() : (ev.empleado || 'Colaborador')),
      empleado: ev.empleado || ev.evaluado?.user || ev.evaluadoNombre || 'Colaborador',
      tipo: ev.tipo || 'Evaluación',
      obs: ev.obs || '',
      lockedBy: ev.lockedBy || null,
      metajobs: ev.metajobs || 5,
      asistencia: ev.asistencia || 5,
      objetivos: ev.objetivos || 5,
      promedio: ev.promedio > 5 ? Number((ev.promedio / 20).toFixed(2)) : (ev.promedio || 5.0),
      scores: ev.scores || null
    }));

    const anunciosRaw = await prisma.anuncio.findMany({ orderBy: { id: 'asc' } });
    const anuncios = anunciosRaw.map(a => ({
      id: a.id,
      fecha: a.fecha || '',
      titulo: a.titulo,
      mensaje: a.mensaje || '',
      lockedBy: a.lockedBy || null,
      contenido: a.contenido || '',
      expiresAt: a.expiresAt || '',
      expired: a.expired || false
    }));

    // Mapear Cotizaciones
    const cotizacionesRaw = await prisma.cotizacion.findMany({
      include: { cliente: true, items: { include: { producto: true } }, vendedor: true },
      orderBy: { id: 'asc' }
    });
    const cotizaciones = cotizacionesRaw.map(c => {
      const meta = (c.equipos && typeof c.equipos === 'object' && !Array.isArray(c.equipos) && c.equipos._meta) ? c.equipos._meta : {};
      const equiposList = (c.equipos && typeof c.equipos === 'object' && !Array.isArray(c.equipos) && Array.isArray(c.equipos.items)) ? c.equipos.items : (Array.isArray(c.equipos) ? c.equipos : []);

      return {
        id: c.id,
        numCotizacion: c.numCotizacion || meta.numCotizacion || '',
        fecha: c.fecha,
        fechaIso: c.fecha,
        vendedor: c.vendedor?.user || '',
        vendedorId: c.vendedorId,
        clienteId: c.clienteId,
        docCli: c.cliente?.doc || meta.clienteNit || '',
        cliente: c.cliente?.nom || meta.clienteNombre || '',
        clienteNombre: meta.clienteNombre || c.cliente?.nom || '',
        clienteDireccion: meta.clienteDireccion || c.cliente?.direccion || '',
        clienteCiudadDpto: meta.clienteCiudadDpto || (c.cliente?.ciudad ? (c.cliente.ciudad + (c.cliente.departamento ? ' / ' + c.cliente.departamento : '')) : ''),
        clientePais: meta.clientePais || 'Colombia',
        clienteTelefono: meta.clienteTelefono || c.cliente?.tel || '',
        clienteMovil: meta.clienteMovil || c.cliente?.celularContacto || c.cliente?.tel || '',
        clienteEmail: meta.clienteEmail || c.cliente?.correo || c.cliente?.correoFacturacion || '',
        clienteNit: meta.clienteNit || c.cliente?.doc || '',
        contacto: c.contacto || meta.contacto || c.cliente?.contactoComercial || '',
        items: c.items.map(i => ({
          productoId: i.productoId,
          producto: i.producto?.ref || i.producto?.cod || '',
          cant: i.cant,
          desc: i.desc,
          precioUnitario: i.precioUnitario
        })),
        idProd: c.items[0]?.productoId || null,
        producto: c.items[0]?.producto?.ref || null,
        cant: c.items.reduce((acc, i) => acc + i.cant, 0),
        desc: meta.desc !== undefined ? meta.desc : c.items.reduce((acc, i) => acc + i.desc, 0),
        precioUnitario: c.items[0]?.precioUnitario || null,
        total: c.total,
        comisionistaId: c.comisionistaId,
        comisionistaNombre: c.comisionistaNombre,
        comisionistaPct: c.comisionistaPct,
        comisionistaValor: c.comisionistaValor,
        lockedBy: c.lockedBy,
        contacto: c.contacto || meta.contacto || '',
        condiciones: c.condiciones || meta.condiciones || '',
        tiempoEntrega: c.tiempoEntrega || meta.tiempoEntrega || '',
        direccionEntrega: c.direccionEntrega || meta.direccionEntrega || '',
        detallePagoMixto: c.detallePagoMixto || meta.detallePagoMixto || '',
        cuentas: c.cuentas,
        cuentasBancarias: c.cuentas || '[]',
        firmanteNombre: c.firmanteNombre,
        firmanteCargo: c.firmanteCargo,
        firmanteCorreo: c.firmanteCorreo,
        firmanteMovil: c.firmanteMovil,
        garantia: c.garantia || meta.garantia || '',
        observacion: c.observacion || meta.observacion || '',
        vendedorNombre: c.vendedorNombre || `${c.vendedor?.nombre || ''} ${c.vendedor?.apellido || ''}`.trim(),
        vendedorCargo: c.vendedorCargo || c.vendedor?.cargo || 'Asesor',
        vendedorEmail: c.vendedorEmail || c.vendedor?.correo || '',
        vendedorMovil: c.vendedorMovil || c.vendedor?.telefono || '',
        vendedorCodigoAsesor: c.vendedorCodigoAsesor || c.vendedor?.codigoAsesor || '',
        vigencia: c.vigencia,
        ivaTipo: c.ivaTipo || meta.ivaTipo || 'sin_iva',
        equipos: equiposList,
        materiales: c.materiales || [],
        tipo_precio: c.tipo_precio || meta.priceTier || 'precio_publico',
        priceTier: meta.priceTier || c.tipo_precio || 'precio_publico',
        fechaSeguimiento: c.fechaSeguimiento,
        estadoSeguimiento: c.estadoSeguimiento,
        motivoSeguimiento: c.motivoSeguimiento,
        motivoNoCompra: c.motivoNoCompra,
        seguimiento: {
          estado: c.estadoSeguimiento || 'pendiente',
          compraParcialDetalles: c.motivoSeguimiento || '',
          noCompraronMotivo: c.motivoNoCompra || '',
          noCompraronDetalle: '',
          fechaSeguimiento: c.fechaSeguimiento ? new Date(c.fechaSeguimiento).toLocaleDateString('es-CO') : null,
          vendedor: c.vendedor?.user || ''
        },
        ...meta
      };
    });

    const chatGroupsRaw = await prisma.chatGroup.findMany({ 
      include: { createdBy: true },
      orderBy: { fecha: 'asc' } 
    });
    const chatGroups = chatGroupsRaw.map(g => ({
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion || '',
      createdById: g.createdById,
      createdBy: g.createdBy?.user || g.createdById,
      creadorNombre: g.createdBy ? `${g.createdBy.nombre} ${g.createdBy.apellido || ''}`.trim() : '',
      fecha: g.fecha ? g.fecha.toISOString() : new Date().toISOString(),
      integrantes: typeof g.integrantes === 'string' ? JSON.parse(g.integrantes) : (g.integrantes || [])
    }));

    const chatDesc = await prisma.chat.findMany({ 
      include: { sender: true, receiver: true },
      orderBy: { timestamp: 'desc' }, 
      take: 200 
    });
    const chat = chatDesc.reverse().map(c => ({
      id: c.id,
      timestamp: c.timestamp ? new Date(c.timestamp).getTime() : Date.now(),
      fecha: c.fecha ? c.fecha.toISOString() : new Date().toISOString(),
      senderId: c.senderId,
      user: c.sender?.user || c.senderId,
      nombre: c.nombre || (c.sender ? `${c.sender.nombre} ${c.sender.apellido || ''}`.trim() : 'Usuario'),
      receiverId: c.receiverId,
      to: c.senderTabId ? c.senderTabId : (c.receiver?.user || c.receiverId || 'Todos'),
      text: c.text || '',
      senderTabId: c.senderTabId || null,
      isNudge: !!c.isNudge,
      isSticker: !!c.isSticker,
      stickerId: c.stickerId || null,
      stickerUrl: c.stickerUrl || null,
      isAudio: !!c.isAudio,
      audioUrl: c.audioUrl || null,
      isFile: !!c.isFile,
      fileUrl: c.fileUrl || null,
      fileName: c.fileName || null,
      fileType: c.fileType || null,
      isMeeting: !!c.isMeeting,
      meetingId: c.meetingId || null,
      readAt: c.readAt ? new Date(c.readAt).getTime() : null,
      isDeleted: !!c.isDeleted,
      isEdited: !!c.isEdited,
      reactions: c.reactions || {},
      replyTo: c.replyTo || null,
      replyToObj: c.replyToObj || null,
      hiddenBy: c.hiddenBy || [],
      fileSize: c.fileSize || null
    }));
    const auditoriaDesc = await prisma.auditoria.findMany({
      include: { user: true },
      orderBy: { id: 'desc' },
      take: 200
    });
    const auditoria = auditoriaDesc.reverse().map(a => ({
      id: a.id,
      userId: a.userId,
      user: a.user?.user || a.user?.nombre || a.userId,
      fecha: a.fecha ? a.fecha.toISOString() : new Date().toISOString(),
      action: a.action,
      modulo: a.modulo,
      recordDetails: a.recordDetails || '',
      shadowingData: a.shadowingData || null,
      hash: a.hash || null
    }));

    const notificacionesDesc = await prisma.notificacion.findMany({
      include: { para: true },
      orderBy: { id: 'desc' },
      take: 100
    });
    const notificaciones = notificacionesDesc.reverse().map(n => ({
      id: n.id,
      paraId: n.paraId,
      para: n.para?.user || n.paraId,
      titulo: n.titulo || null,
      mensaje: n.mensaje,
      de: n.de || null,
      tipo: n.tipo || null,
      fecha: n.fecha ? n.fecha.toISOString() : new Date().toISOString(),
      leida: !!n.leida,
      targetModule: n.targetModule || null
    }));
    const cuentasCobroRaw = await prisma.cuentasCobro.findMany({ orderBy: { fecha: 'asc' } });
    const cuentasCobro = cuentasCobroRaw.map(c => ({
      id: c.id,
      ciudad: c.ciudad || '',
      fecha: c.fecha || '',
      cuenta: c.cuenta || '',
      nombre: c.nombre || '',
      cedula: c.cedula || '',
      correo: c.correo || '',
      concepto: c.concepto || '',
      items: c.items ? (typeof c.items === 'string' ? JSON.parse(c.items) : c.items) : [],
      nequi: c.nequi || '',
      titular: c.titular || '',
      estado: c.estado || '',
      total: c.total || 0,
      tecnicos: c.tecnicos ? (typeof c.tecnicos === 'string' ? JSON.parse(c.tecnicos) : c.tecnicos) : [],
      fechaRadicacion: c.fechaRadicacion || null,
      fechaAprobacion: c.fechaAprobacion || null,
      fechaPago: c.fechaPago || null,
      aprobadoPor: c.aprobadoPor || '',
      notasSeguimiento: c.notasSeguimiento || ''
    }));

    const comisionistasRaw = await prisma.comisionista.findMany({ orderBy: { id: 'asc' } });
    const comisionistas = comisionistasRaw.map(c => ({
      id: c.id,
      tipo: c.tipo || '',
      nombre: c.nombre,
      cedula: c.cedula || '',
      telefono: c.telefono || '',
      correo: c.correo || '',
      direccion: c.direccion || '',
      cliente_remite: c.cliente_remite || '',
      valor_venta: c.valor_venta || 0,
      pct_comision: c.pct_comision || 10,
      fecha: c.fecha || '',
      owner: c.owner || '',
      lockedBy: c.lockedBy || null,
      doc: c.doc || '',
      tel: c.tel || '',
      porcentaje: c.porcentaje || 10,
      estado: c.estado || 'Activo',
      banco: c.banco || '',
      tipoCuenta: c.tipoCuenta || '',
      numeroCuenta: c.numeroCuenta || ''
    }));

    // WhatsApp Config
    const config = await prisma.whatsappConfig.findFirst();
    let parsedTemplates = null;
    if (config && config.templates) {
      try {
        parsedTemplates = typeof config.templates === 'string' ? JSON.parse(config.templates) : config.templates;
      } catch (e) { parsedTemplates = null; }
    }
    const whatsappConfig = config ? { phone: config.phone, status: config.status, templates: parsedTemplates } : { phone: '', status: 'Activo', templates: null };
    const informesConfig = await prisma.informesConfig.findUnique({ where: { id: 1 } });
    
    // Configuraci├│n general combinada
    const appConfig = {
      whatsapp: whatsappConfig || { phone: '', status: 'Activo' },
      informes: informesConfig || { 
        margenOperativo: 72, 
        ingresoProyectos: 85, 
        gastosInstalacion: 35, 
        anticipos: 12450000, 
        gastosCajaChica: 2180000,
        diasHabilesMes: 25,
        mesPresupuesto: "ACTUAL",
        fechaCorte: "HOY",
        diasTranscurridos: 0
      }
    };

    const capacitacionesRaw = await prisma.capacitacion.findMany({
      include: { creador: true },
      orderBy: { fecha: 'desc' }
    });
    const isCallerMaster = requestingUser && (
      String(requestingUser.roleId) === '1' ||
      requestingUser.roleId === 1 ||
      String(requestingUser.user || '').toLowerCase() === 'admin'
    );

    const capacitaciones = capacitacionesRaw.map(c => {
      let rawAsistentes = c.asistentes ? (typeof c.asistentes === 'string' ? JSON.parse(c.asistentes) : c.asistentes) : [];
      if (!Array.isArray(rawAsistentes)) rawAsistentes = [];

      // Blindaje Master: lo de master es de master (no visible para otros usuarios)
      if (!isCallerMaster) {
        rawAsistentes = rawAsistentes.filter(a => {
          const uId = String(a.userId || '').toLowerCase();
          return uId !== 'admin' && uId !== '1';
        });
      }

      return {
        id: c.id,
        tipo: c.tipo || 'Capacitación',
        tema: c.tema,
        descripcion: c.descripcion || '',
        fecha: c.fecha ? (typeof c.fecha === 'string' ? c.fecha : c.fecha.toISOString()) : '',
        hora: c.hora || '08:00 AM',
        obligatoria: c.obligatoria,
        creadorId: c.creadorId,
        creador: c.creador?.user || '',
        creadorNombre: c.creador ? `${c.creador.nombre} ${c.creador.apellido || ''}`.trim() : '',
        videoLink: c.videoLink || '',
        videoFile: c.videoFile || null,
        videoFileName: c.videoFileName || '',
        plataforma: c.plataforma || null,
        enlaceReunion: c.enlaceReunion || null,
        tutorFirma: c.tutorFirma || null,
        tutor: c.tutor || null,
        creadoEn: c.creadoEn ? (typeof c.creadoEn === 'string' ? c.creadoEn : c.creadoEn.toISOString()) : '',
        materiales: c.materiales ? (typeof c.materiales === 'string' ? JSON.parse(c.materiales) : c.materiales) : [],
        asistentes: rawAsistentes,
        evaluacion: c.evaluacion ? (typeof c.evaluacion === 'string' ? JSON.parse(c.evaluacion) : c.evaluacion) : null,
        estado: c.estado || 'Programada',
        lockedBy: c.lockedBy || null
      };
    });

    const pendingResets = await prisma.pendingReset.findMany({ orderBy: { id: 'asc' } });

    // Operaciones en Campo (Colecciones livianas para soporte offline)
    const geocercas = await prisma.geocerca.findMany({ where: { activo: true }, orderBy: { id: 'asc' } });
    const zonasComerciales = await prisma.zonaComercial.findMany({ where: { activo: true }, orderBy: { id: 'asc' } });
    const prospectosCampo = await prisma.prospectoCampo.findMany({
      orderBy: { fechaCreacion: 'desc' },
      take: 100
    });
    const visitasCampo = await prisma.visitaCampo.findMany({
      orderBy: { fechaProgramada: 'desc' },
      take: 100,
      include: { cliente: true, prospecto: true }
    });

    return {
      users, roles, clientes, inventario, ventas, pqrs, servicios,
      solicitudes, procesosDisciplinarios, evaluaciones, anuncios,
      cotizaciones, chatGroups, chat, auditoria, notificaciones, cuentasCobro, comisionistas, informesConfig, capacitaciones, pendingResets, config: appConfig, whatsappConfig,
      geocercas, zonasComerciales, prospectosCampo, visitasCampo
    };
  }

  async sync(diff, user) {
    await prisma.$transaction(async (tx) => {
      let cachedUsers = null;
      const getUsersCache = async () => {
        if (!cachedUsers) {
          cachedUsers = await tx.user.findMany({ select: { id: true, user: true, nombre: true, apellido: true } });
        }
        return cachedUsers;
      };

      const resolveUser = async (userRef, allowFallback = true) => {
        const all = await getUsersCache();
        if (!userRef) {
          return allowFallback ? (user?.id || all[0]?.id || '1') : null;
        }
        const str = String(userRef).trim();
        const byId = all.find(u => String(u.id) === str);
        if (byId) return byId.id;
        const byUser = all.find(u => u.user && u.user.toLowerCase() === str.toLowerCase());
        if (byUser) return byUser.id;
        const byNom = all.find(u => (`${u.nombre} ${u.apellido || ''}`).trim().toLowerCase() === str.toLowerCase());
        if (byNom) return byNom.id;
        return allowFallback ? (user?.id || all[0]?.id || '1') : null;
      };

      // Helper para upserts en tablas planas directas
      const flatUpsert = async (table, items) => {
        for (const rawItem of items) {
          const item = sanitizeBackendForPrisma(table, rawItem);
          const { ...data } = item;

        if (table === 'user') {
          // Ya permitimos que foto se guarde y sincronice
        }

        // Evitar conflictos por llaves únicas (como doc en Clientes o user en Usuarios)
        if (table === 'cliente' && item.doc) {
          const existing = await tx.cliente.findUnique({ where: { doc: item.doc } });
          if (existing) {
            delete data.id;
            const cleanClientData = sanitizeBackendForPrisma('cliente', data);
            await tx.cliente.update({
              where: { id: existing.id },
              data: cleanClientData
            });
            continue;
          }
        }

        if (table === 'auditoria') {
          if (data.user && typeof data.user === 'string') {
            const dbU = await tx.user.findFirst({ where: { user: data.user } });
            if (dbU) {
              data.userId = dbU.id;
            }
            delete data.user;
          }
          if (data.fecha) {
            const d = new Date(data.fecha);
            if (!isNaN(d)) {
              data.fecha = d;
            } else {
              data.fecha = new Date(); // Fallback for localized invalid strings
            }
          } else {
            data.fecha = new Date();
          }
        }

        if (table === 'user' && item.user) {
          const existing = await tx.user.findUnique({ where: { user: item.user } });
          if (existing) {
            delete data.id;
            if (data.pass) {
              const isBcrypt = data.pass.startsWith('$2a$') || data.pass.startsWith('$2b$') || data.pass.startsWith('$2y$');
              if (!isBcrypt) {
                data.pass = bcrypt.hashSync(data.pass, 10);
              }
            }
            const cleanUserData = sanitizeBackendForPrisma('user', data);
            if (!cleanUserData.firma && existing.firma) {
              cleanUserData.firma = existing.firma;
            }
            await tx.user.update({
              where: { id: existing.id },
              data: cleanUserData
            });
            continue;
          }
        }

        if (table === 'user' && data.pass) {
        const isBcrypt = data.pass.startsWith('$2a$') || data.pass.startsWith('$2b$') || data.pass.startsWith('$2y$');
        if (!isBcrypt) {
          data.pass = bcrypt.hashSync(data.pass, 10);
        }
      }

      // Optimistic Concurrency Control (OCC) - Prevención Anti-Sobrescritura
      try {
        const existingRecord = await tx[table].findUnique({ where: { id: item.id } });
        if (existingRecord && existingRecord.lockedBy && existingRecord.lockedBy !== user) {
          console.warn(`[OCC BLOCK] Usuario '${user}' intentó sobrescribir '${table}' ID '${item.id}' que está bloqueado por '${existingRecord.lockedBy}'. Sincronización denegada para este registro.`);
          continue; // Saltar la actualización para no corromper datos del otro asesor
        }
      } catch (e) {
        // Ignorar si la tabla no soporta findUnique por ID u otras razones
      }

      const finalData = sanitizeBackendForPrisma(table, data);
      delete finalData.id;
      await tx[table].upsert({
        where: { id: item.id },
        update: finalData,
        create: { id: item.id, ...finalData },
      });
    }
    };

    // Helper para eliminaciones en tablas planas directas
    const flatDelete = async (table, ids) => {
      if (ids && ids.length > 0) {
        await tx[table].deleteMany({
          where: { id: { in: ids.map(id => id.toString()) } },
        });
      }
    };

    // --- FASE 1: Tablas Independientes ---

    // 1. Roles
    if (diff.roles) {
      await flatUpsert('role', diff.roles.upserted || []);
      await flatDelete('role', diff.roles.deleted || []);
    }

    // 2. Clientes
    if (diff.clientes) {
      await flatUpsert('cliente', diff.clientes.upserted || []);
      await flatDelete('cliente', diff.clientes.deleted || []);
    }

    // 3. Inventario (Productos)
    if (diff.inventario) {
      await flatUpsert('inventario', diff.inventario.upserted || []);
      await flatDelete('inventario', diff.inventario.deleted || []);
    }

    // 4. Usuarios
    if (diff.users) {
      const isBcryptHash = (str) => /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
      const processedUsers = (diff.users.upserted || []).map(u => {
        if (u.pass && !isBcryptHash(u.pass)) {
          return { ...u, pass: bcrypt.hashSync(u.pass, 10) };
        }
        return u;
      });
      await flatUpsert('user', processedUsers);
      await flatDelete('user', diff.users.deleted || []);
    }

    // --- FASE 2: Tablas Relacionales (Dependen de Clientes y Productos) ---

    const findOrCreateClient = async (item) => {
      let client = null;
      if (item.clienteId) {
        client = await tx.cliente.findUnique({ where: { id: item.clienteId } });
      }
      if (!client && item.docCli) {
        client = await tx.cliente.findUnique({ where: { doc: item.docCli } });
      }
      if (!client && (item.docCli || item.cliente || item.clienteNombre)) {
        const doc = item.docCli || `GEN-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        client = await tx.cliente.upsert({
          where: { doc: doc },
          update: {},
          create: {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            doc_tipo: 'CC',
            doc: doc,
            nom: item.clienteNombre || item.cliente || 'Cliente Genérico',
            tipo_cliente: 'Nuevo',
            tel: item.clienteTelefono || item.clienteMovil || item.tel || '0',
            correo: item.clienteEmail || item.correo || 'correo@ejemplo.com',
            direccion: item.clienteDireccion || ''
          }
        });
      }
      if (!client) client = await tx.cliente.findFirst();
      return client;
    };

    // 5. Ventas / Facturación
    if (diff.ventas) {
      // Eliminar primero
      await flatDelete('venta', diff.ventas.deleted || []);

      // Upsert
      for (const item of diff.ventas.upserted || []) {
        const client = await findOrCreateClient(item);
        
        // Encontrar Producto (1 sola petición a BD)
        const productConditions = [];
        if (item.productoId) productConditions.push({ id: item.productoId });
        if (item.idProd) productConditions.push({ id: item.idProd });
        if (item.producto) productConditions.push({ ref: item.producto });
        const product = productConditions.length > 0 
          ? await tx.inventario.findFirst({ where: { OR: productConditions } }) 
          : null;

        if (!client || !product) {
          throw new Error(`Sync Venta ${item.id} fallida: Cliente (${item.clienteId || item.docCli}) o Producto (${item.productoId || item.idProd}) no encontrado.`);
        }

        const data = {
          fecha: item.fecha ? new Date(item.fecha) : new Date(),
          fechaIso: item.fechaIso ? new Date(item.fechaIso) : new Date(),
          venceGarantiaIso: item.venceGarantiaIso ? new Date(item.venceGarantiaIso) : new Date(),
          mesesGarantia: parseInt(item.mesesGarantia) || 0,
          vendedor: item.vendedor,
          clienteId: client.id,
          productoId: product.id,
          cant: parseInt(item.cant) || 0,
          desc: parseFloat(item.desc) || 0,
          metodoPago: item.metodoPago || 'Efectivo',
          total: parseFloat(item.total) || 0,
          comisionistaId: item.comisionistaId || null,
          comisionistaNombre: item.comisionistaNombre || null,
          comisionistaPct: item.comisionistaPct ? parseFloat(item.comisionistaPct) : null,
          comisionistaValor: item.comisionistaValor ? parseFloat(item.comisionistaValor) : null,
          tipo_precio: item.tipo_precio || null,
          precioUnitario: item.precioUnitario ? parseFloat(item.precioUnitario) : null,
          lockedBy: item.lockedBy || null,
          serialEquipo: item.serialEquipo || null,
          vendedorNombre: item.vendedorNombre || null,
          vendedorCargo: item.vendedorCargo || null,
          vendedorEmail: item.vendedorEmail || null,
          vendedorMovil: item.vendedorMovil || null,
          vendedorCodigoAsesor: item.vendedorCodigoAsesor || null,
          estadoComision: item.estadoComision || null,
          fechaComision: item.fechaComision || null,
          equipos: item.equipos ? (typeof item.equipos === 'string' ? item.equipos : JSON.stringify(item.equipos)) : null,
          materiales: item.materiales ? (typeof item.materiales === 'string' ? item.materiales : JSON.stringify(item.materiales)) : null
        };

        const cleanVentaData = sanitizeBackendForPrisma('venta', data);
        delete cleanVentaData.id;
        await tx.venta.upsert({
          where: { id: item.id },
          update: cleanVentaData,
          create: { id: item.id, ...cleanVentaData },
        });
      }
    }

    // 6. Cotizaciones
    if (diff.cotizaciones) {
      await flatDelete('cotizacion', diff.cotizaciones.deleted || []);

      for (const item of diff.cotizaciones.upserted || []) {
        const client = await findOrCreateClient(item);

        // Encontrar Producto (1 sola petici├│n a BD)
        const productConditions = [];
        if (item.productoId) productConditions.push({ id: item.productoId });
        if (item.idProd) productConditions.push({ id: item.idProd });
        if (item.producto) productConditions.push({ ref: item.producto });
        let product = productConditions.length > 0 
          ? await tx.inventario.findFirst({ where: { OR: productConditions } }) 
          : null;

        // Backwards compatibility fallback if product is not found (e.g. legacy or manual product)
        if (!product) {
          product = await tx.inventario.findFirst();
        }

        if (!client || !product) {
          throw new Error(`Sync Cotizacion ${item.id} fallida: Cliente o Producto no encontrado.`);
        }

        const data = {
          numCotizacion: item.numCotizacion || null,
          fecha: item.fecha ? new Date(item.fecha) : new Date(),
          vendedor: item.vendedor,
          clienteId: client.id,
          productoId: product.id,
          cant: parseInt(item.cant) || 0,
          desc: parseFloat(item.desc) || 0,
          total: parseFloat(item.total) || 0,
          comisionistaId: item.comisionistaId || null,
          comisionistaNombre: item.comisionistaNombre || null,
          comisionistaPct: item.comisionistaPct ? parseFloat(item.comisionistaPct) : null,
          comisionistaValor: item.comisionistaValor ? parseFloat(item.comisionistaValor) : null,
          lockedBy: item.lockedBy || null,
          contacto: item.contacto || null,
          condiciones: item.condiciones || null,
          tiempoEntrega: item.tiempoEntrega || null,
          direccionEntrega: item.direccionEntrega || null,
          detallePagoMixto: item.detallePagoMixto || null,
          cuentas: item.cuentas || null,
          firmanteNombre: item.firmanteNombre || null,
          firmanteCargo: item.firmanteCargo || null,
          firmanteCorreo: item.firmanteCorreo || null,
          firmanteMovil: item.firmanteMovil || null,
          garantia: item.garantia || null,
          observacion: item.observacion || null,
          vendedorNombre: item.vendedorNombre || null,
          vendedorCargo: item.vendedorCargo || null,
          vendedorEmail: item.vendedorEmail || null,
          vendedorMovil: item.vendedorMovil || null,
          vendedorCodigoAsesor: item.vendedorCodigoAsesor || null,
          vigencia: item.vigencia ? parseInt(item.vigencia) : 10,
          ivaTipo: item.ivaTipo || "exento",
          equipos: item.equipos ? JSON.stringify(item.equipos) : null,
          materiales: item.materiales ? JSON.stringify(item.materiales) : null,
          tipo_precio: item.tipo_precio || null,
          precioUnitario: item.precioUnitario ? parseFloat(item.precioUnitario) : null,
          fechaSeguimiento: item.fechaSeguimiento || null,
          estadoSeguimiento: item.estadoSeguimiento || null,
          motivoSeguimiento: item.motivoSeguimiento || null,
          motivoNoCompra: item.motivoNoCompra || null
        };

        const cleanCotizacionData = sanitizeBackendForPrisma('cotizacion', data);
        delete cleanCotizacionData.id;
        await tx.cotizacion.upsert({
          where: { id: item.id },
          update: cleanCotizacionData,
          create: { id: item.id, ...cleanCotizacionData },
        });
      }
    }

    // 7. PQRS
    if (diff.pqrs) {
      await flatDelete('pQR', diff.pqrs.deleted || []);

      for (const item of diff.pqrs.upserted || []) {
        const client = await findOrCreateClient(item);
        
        if (!client) {
          throw new Error(`Sync PQR ${item.id} fallida: Cliente con doc ${item.docCli} / ID ${item.clienteId} no encontrado.`);
        }

        let asigId = null;
        if (item.usuarioAsignadoId) {
          asigId = await resolveUser(item.usuarioAsignadoId, false);
        } else if (item.usuarioAsignado) {
          asigId = await resolveUser(item.usuarioAsignado, false);
        }

        const data = {
          fecha: item.fecha ? new Date(item.fecha) : new Date(),
          limiteIso: item.limiteIso ? new Date(item.limiteIso) : new Date(),
          clienteId: client.id,
          tipo: item.tipo,
          detalle: item.detalle,
          evidencia: item.evidencia || null,
          fileUrl: item.fileUrl || item.fileData || null,
          estado: item.estado,
          satisfecho: item.satisfecho,
          lockedBy: item.lockedBy || null,
          radicado: item.radicado || null,
          hechos: item.hechos || null,
          solicitudes: item.solicitudes || null,
          evidencias: item.evidencias || null,
          aplicaGarantia: item.aplicaGarantia ?? false,
          tratamientoGarantia: item.tratamientoGarantia || null,
          terminoLegal: item.terminoLegal || null,
          fechaCierre: item.fechaCierre || null,
          inventarioId: item.inventarioId || null,
          ventaId: item.ventaId || null,
          cotizacionId: item.cotizacionId || null,
          trazabilidad: item.trazabilidad || null,
          usuarioAsignadoId: asigId,
        };

        const cleanPqrData = sanitizeBackendForPrisma('pqr', data);
        delete cleanPqrData.id;
        await tx.pQR.upsert({
          where: { id: item.id },
          update: cleanPqrData,
          create: { id: item.id, ...cleanPqrData },
        });
      }
    }

    // 8. Servicios T├®cnicos
    if (diff.servicios) {
      await flatDelete('servicio', diff.servicios.deleted || []);

      for (const item of diff.servicios.upserted || []) {
        const client = await findOrCreateClient(item);
        
        if (!client) {
          throw new Error(`Sync Servicio ${item.id} fallida: Cliente con doc ${item.docCli} / ID ${item.clienteId} no encontrado.`);
        }

        const data = {
          clienteId: client.id,
          fechaProg: item.fechaProg ? new Date(item.fechaProg) : new Date(),
          tipo: item.tipo,
          obs: item.obs,
          estado: item.estado,
          obsAdmin: item.obsAdmin || null,
          lockedBy: item.lockedBy || null,
          tecnico: item.tecnico || null,
          equipoDetalle: item.equipoDetalle || null,
          obsRecepcion: item.obsRecepcion || null,
          obsDiagnostico: item.obsDiagnostico || null,
          obsCotizacion: item.obsCotizacion || null,
          obsEjecucion: item.obsEjecucion || null,
          obsCalidad: item.obsCalidad || null,
          fechaCreacion: item.fechaCreacion || null,
          fechaIso: item.fechaIso || null,
          radicado: item.radicado || null,
          inventarioId: item.inventarioId || null,
          ventaId: item.ventaId || null,
          cotizacionId: item.cotizacionId || null,
          etapaActual: item.etapaActual || null,
          evidencias: item.evidencias || null,
          trazabilidad: item.trazabilidad || null,
          aplicaGarantia: item.aplicaGarantia ?? false,
          costoServicio: item.costoServicio ? parseFloat(item.costoServicio) : 0,
        };

        const cleanServicioData = sanitizeBackendForPrisma('servicio', data);
        delete cleanServicioData.id;
        await tx.servicio.upsert({
          where: { id: item.id },
          update: cleanServicioData,
          create: { id: item.id, ...cleanServicioData },
        });
      }
    }

    // --- FASE 3: Otras Tablas Planas ---

    // 9. Solicitudes Laborales
    if (diff.solicitudes) {
      await flatDelete('solicitud', diff.solicitudes.deleted || []);
      for (const item of diff.solicitudes.upserted || []) {
        let asId = await resolveUser(item.asesorId || item.asesor);
        if (!asId) asId = user?.id || (await getUsersCache())[0]?.id;
        const solData = sanitizeBackendForPrisma('solicitud', {
          ...item,
          asesorId: asId,
          fileUrl: item.fileUrl || item.fileData || null
        });
        const { id: idToUpsert, ...updateData } = solData;
        await tx.solicitud.upsert({
          where: { id: idToUpsert || item.id },
          update: updateData,
          create: { id: idToUpsert || item.id, ...updateData },
        });
      }
    }

    // 10. Procesos Disciplinarios
    if (diff.procesosDisciplinarios) {
      await flatDelete('procesoDisciplinario', diff.procesosDisciplinarios.deleted || []);
      for (const item of diff.procesosDisciplinarios.upserted || []) {
        let asId = await resolveUser(item.asesorId || item.asesor);
        let jId = item.jefe && item.jefe !== 'Admin' ? await resolveUser(item.jefeId || item.jefe, false) : null;
        const procData = sanitizeBackendForPrisma('procesoDisciplinario', {
          ...item,
          asesorId: asId,
          jefeId: jId
        });
        const { id: idToUpsert, ...updateData } = procData;
        await tx.procesoDisciplinario.upsert({
          where: { id: idToUpsert || item.id },
          update: updateData,
          create: { id: idToUpsert || item.id, ...updateData },
        });
      }
    }

    // 11. Evaluaciones
    if (diff.evaluaciones) {
      await flatUpsert('evaluacion', diff.evaluaciones.upserted || []);
      await flatDelete('evaluacion', diff.evaluaciones.deleted || []);
    }

    // 12. Comunicados Oficiales (Anuncios)
    if (diff.anuncios) {
      await flatUpsert('anuncio', diff.anuncios.upserted || []);
      await flatDelete('anuncio', diff.anuncios.deleted || []);
    }

    // 13. Chat Interno
    if (diff.chat) {
      await flatDelete('chat', diff.chat.deleted || []);
      for (const item of diff.chat.upserted || []) {
        let sndId = await resolveUser(item.senderId || item.user || item.sender);
        if (!sndId) sndId = user?.id || (await getUsersCache())[0]?.id;

        const toStr = item.to ? String(item.to).trim() : '';
        const isTodos = !toStr || toStr.toLowerCase() === 'todos';
        let rcvId = null;
        let tabId = item.senderTabId || null;

        if (!isTodos) {
          rcvId = await resolveUser(toStr || item.receiverId, false);
          if (!rcvId) {
            // Si no es un usuario directo, es un grupo de chat
            tabId = toStr;
          }
        }

        const chData = sanitizeBackendForPrisma('chat', { ...item, senderId: sndId, receiverId: rcvId, senderTabId: tabId });
        const { id: idToUpsert, ...updateData } = chData;

        await tx.chat.upsert({
          where: { id: idToUpsert || item.id },
          update: updateData,
          create: { id: idToUpsert || item.id, ...updateData },
        });
      }
    }

    // 13.5 Grupos de Chat
    if (diff.chatGroups) {
      await flatDelete('chatGroup', diff.chatGroups.deleted || []);
      for (const item of diff.chatGroups.upserted || []) {
        let crId = await resolveUser(item.createdById || item.createdBy);
        if (!crId) crId = user?.id || (await getUsersCache())[0]?.id;

        const cgData = sanitizeBackendForPrisma('chatGroup', { ...item, createdById: crId });
        const { id: idToUpsert, ...updateData } = cgData;

        await tx.chatGroup.upsert({
          where: { id: idToUpsert || item.id },
          update: updateData,
          create: { id: idToUpsert || item.id, ...updateData },
        });
      }
    }

    // 14. Auditor├¡a
    if (diff.auditoria) {
      await flatUpsert('auditoria', diff.auditoria.upserted || []);
      await flatDelete('auditoria', diff.auditoria.deleted || []);
    }

    // 15. Notificaciones
    if (diff.notificaciones) {
      await flatDelete('notificacion', diff.notificaciones.deleted || []);
      for (const item of diff.notificaciones.upserted || []) {
        let pId = await resolveUser(item.paraId || item.para);
        const notData = sanitizeBackendForPrisma('notificacion', { ...item, paraId: pId });
        const { id: idToUpsert, ...updateData } = notData;
        await tx.notificacion.upsert({
          where: { id: idToUpsert || item.id },
          update: updateData,
          create: { id: idToUpsert || item.id, ...updateData },
        });
      }
    }

    // 16. Comisionistas
    if (diff.comisionistas) {
      if (diff.comisionistas.deleted && diff.comisionistas.deleted.length > 0) {
        const comIds = diff.comisionistas.deleted.map(id => id.toString());
        await tx.venta.updateMany({
          where: { comisionistaId: { in: comIds } },
          data: { comisionistaId: null }
        });
        await flatDelete('comisionista', comIds);
      }
      await flatUpsert('comisionista', diff.comisionistas.upserted || []);
    }

    // 20. Cuentas de Cobro
    if (diff.cuentasCobro) {
      await flatDelete('cuentasCobro', diff.cuentasCobro.deleted || []);
      for (const item of diff.cuentasCobro.upserted || []) {
        const data = {
          ciudad: item.ciudad || null,
          fecha: item.fecha || null,
          cuenta: item.cuenta || null,
          nombre: item.nombre || null,
          cedula: item.cedula || null,
          correo: item.correo || null,
          concepto: item.concepto || null,
          items: item.items ? JSON.stringify(item.items) : null,
          nequi: item.nequi || null,
          titular: item.titular || null,
          estado: item.estado || null,
          total: item.total ? parseFloat(item.total) : 0,
          tecnicos: item.tecnicos ? (typeof item.tecnicos === 'string' ? item.tecnicos : JSON.stringify(item.tecnicos)) : null,
        };

        const cleanCuentaData = sanitizeBackendForPrisma('cuentasCobro', data);
        delete cleanCuentaData.id;
        await tx.cuentasCobro.upsert({
          where: { id: item.id },
          update: cleanCuentaData,
          create: { id: item.id, ...cleanCuentaData },
        });
      }
    }

    // 17. PendingResets
    if (diff.pendingResets) {
      await flatUpsert('pendingReset', diff.pendingResets.upserted || []);
      await flatDelete('pendingReset', diff.pendingResets.deleted || []);
    }

    // 21. Capacitaciones
    if (diff.capacitaciones) {
      await flatDelete('capacitacion', diff.capacitaciones.deleted || []);
      for (const item of diff.capacitaciones.upserted || []) {
        let mergedAsistentes = item.asistentes || null;
        if (mergedAsistentes) {
          if (typeof mergedAsistentes === 'string') {
            try { mergedAsistentes = JSON.parse(mergedAsistentes); } catch(e) {}
          }
        }
        if (!Array.isArray(mergedAsistentes) && mergedAsistentes !== null) mergedAsistentes = [];

        // Si el usuario que sincroniza no es Master, preservar en la BD los asistentes Master previos
        const isMasterSyncUser = user && (
          String(user.roleId) === '1' ||
          user.roleId === 1 ||
          String(user.user || '').toLowerCase() === 'admin'
        );

        if (!isMasterSyncUser && mergedAsistentes) {
          const existingCap = await tx.capacitacion.findUnique({
            where: { id: item.id },
            select: { asistentes: true }
          });
          if (existingCap && existingCap.asistentes) {
            const prevAsistList = Array.isArray(existingCap.asistentes)
              ? existingCap.asistentes
              : (typeof existingCap.asistentes === 'string' ? JSON.parse(existingCap.asistentes) : []);
            
            const masterRecords = prevAsistList.filter(a => {
              const uId = String(a.userId || '').toLowerCase();
              return uId === 'admin' || uId === '1';
            });

            masterRecords.forEach(mRec => {
              if (!mergedAsistentes.some(a => String(a.userId).toLowerCase() === String(mRec.userId).toLowerCase())) {
                mergedAsistentes.push(mRec);
              }
            });
          }
        }

        const data = {
          tipo: item.tipo || 'Capacitación',
          tema: item.tema,
          descripcion: item.descripcion || null,
          fecha: item.fecha ? new Date(item.fecha) : new Date(),
          hora: item.hora || '08:00 AM',
          obligatoria: item.obligatoria ?? true,
          creadorId: crId,
          videoLink: item.videoLink || null,
          videoFile: item.videoFile || null,
          videoFileName: item.videoFileName || null,
          plataforma: item.plataforma || null,
          enlaceReunion: item.enlaceReunion || null,
          tutorFirma: item.tutorFirma || null,
          tutor: item.tutor || null,
          creadoEn: item.creadoEn ? new Date(item.creadoEn) : new Date(),
          materiales: item.materiales || null,
          asistentes: mergedAsistentes,
          evaluacion: item.evaluacion || null,
          estado: item.estado || 'Programada',
          lockedBy: item.lockedBy || null
        };

        const cleanCapacitacionData = sanitizeBackendForPrisma('capacitacion', data);
        delete cleanCapacitacionData.id;
        await tx.capacitacion.upsert({
          where: { id: item.id },
          update: cleanCapacitacionData,
          create: { id: item.id, ...cleanCapacitacionData },
        });
      }
    }

    // 18. Configuraci├│n Global (WhatsApp e Informes)
    if (diff.config && diff.config.value) {
      const configVal = diff.config.value;
      
      if (configVal.whatsapp) {
        await tx.whatsappConfig.upsert({
          where: { id: 1 },
          update: { phone: configVal.whatsapp.phone, status: configVal.whatsapp.status },
          create: { id: 1, phone: configVal.whatsapp.phone, status: configVal.whatsapp.status },
        });
      }

      if (configVal.informes) {
        await tx.informesConfig.upsert({
          where: { id: 1 },
          update: { 
            margenOperativo: configVal.informes.margenOperativo,
            ingresoProyectos: configVal.informes.ingresoProyectos,
            gastosInstalacion: configVal.informes.gastosInstalacion,
            anticipos: configVal.informes.anticipos,
            gastosCajaChica: configVal.informes.gastosCajaChica,
            diasHabilesMes: configVal.informes.diasHabilesMes,
            mesPresupuesto: configVal.informes.mesPresupuesto,
            fechaCorte: configVal.informes.fechaCorte,
            diasTranscurridos: configVal.informes.diasTranscurridos
          },
          create: { 
            id: 1, 
            margenOperativo: configVal.informes.margenOperativo,
            ingresoProyectos: configVal.informes.ingresoProyectos,
            gastosInstalacion: configVal.informes.gastosInstalacion,
            anticipos: configVal.informes.anticipos,
            gastosCajaChica: configVal.informes.gastosCajaChica,
            diasHabilesMes: configVal.informes.diasHabilesMes,
            mesPresupuesto: configVal.informes.mesPresupuesto,
            fechaCorte: configVal.informes.fechaCorte,
            diasTranscurridos: configVal.informes.diasTranscurridos
          },
        });
      }
    }

    // Fin de la transacci├│n
    }, {
      timeout: 30000 // 30s timeout para sincronizaciones grandes
    });
  }
}

module.exports = new SyncService();