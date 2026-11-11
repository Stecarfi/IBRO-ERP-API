const prisma = require('../../prisma');

class OperacionExternaService {
  // =================================================================
  // 1. GESTIÓN DE CLIENTES EXTERNOS Y PROSPECTOS
  // =================================================================

  /**
   * Obtiene la cartera de clientes externos y prospectos con filtros,
   * consolidando tanto el directorio formal como los clientes reales atendidos en visitas de terreno.
   */
  async getClientesExternos({ usuarioId, etapa, tipo, search, esDelegado = false }) {
    const where = {};

    if (!esDelegado && usuarioId) {
      where.comercialId = usuarioId;
    } else if (usuarioId && usuarioId !== 'TODOS') {
      where.comercialId = usuarioId;
    }

    if (etapa && etapa !== 'TODAS') {
      where.etapaEmbudo = etapa;
    }

    if (tipo && tipo !== 'TODOS') {
      where.tipoRegistro = tipo;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { nitDoc: { contains: q, mode: 'insensitive' } },
        { contacto: { contains: q, mode: 'insensitive' } },
        { telefono: { contains: q, mode: 'insensitive' } },
        { ciudad: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [clientesFormales, visitasReales] = await Promise.all([
      prisma.clienteExternoCampo.findMany({
        where,
        include: {
          comercial: {
            select: { id: true, nombre: true, apellido: true, cargo: true }
          },
          seguimientos: {
            orderBy: { fechaHora: 'desc' },
            take: 15
          },
          _count: {
            select: {
              visitas: true,
              seguimientos: true,
              cotizaciones: true,
              ventas: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.visitaCampo.findMany({
        where: {
          checkInHora: { not: null },
          ...((!esDelegado && usuarioId) ? { usuarioId } : (usuarioId && usuarioId !== 'TODOS' ? { usuarioId } : {}))
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, cargo: true } }
        },
        orderBy: { checkInHora: 'desc' }
      })
    ]);

    const ahoraMs = Date.now();
    const nombresFormalesMap = new Map();
    clientesFormales.forEach(c => {
      const key = (c.nombre || '').trim().toLowerCase();
      if (key) nombresFormalesMap.set(key, c);
    });

    // Agrupar clientes visitados en terreno y vincular/enriquecer conteo real de visitas
    const clientesDeVisitasMap = new Map();
    visitasReales.forEach(v => {
      const rawNombre = (v.resultadoResumen || '').trim();
      if (!rawNombre) return;
      // Ignorar nombres genéricos de rutas o etiquetas de parada sin nombre de cliente real
      if (
        /^\[Ruta\s/i.test(rawNombre) ||
        /^Parada\s*#/i.test(rawNombre) ||
        /^\d+\s*:\s*Zonas/i.test(rawNombre) ||
        /^Realizar la cobertura/i.test(rawNombre) ||
        /^Cubrir la zona/i.test(rawNombre) ||
        /^Cada uno de los clientes/i.test(rawNombre)
      ) {
        return;
      }

      const normKey = rawNombre.toLowerCase();
      if (nombresFormalesMap.has(normKey)) {
        const formal = nombresFormalesMap.get(normKey);
        if (formal._count) {
          formal._count.visitas = Math.max(formal._count.visitas || 0, (formal._visitasTerrenoCount || 0) + 1);
          formal._visitasTerrenoCount = (formal._visitasTerrenoCount || 0) + 1;
        }
        return;
      }

      let dirExtraida = '';
      if (v.observaciones && v.observaciones.includes('(') && v.observaciones.includes(')')) {
        const m = v.observaciones.match(/\((.*?)\)/);
        if (m && m[1] && !m[1].includes('Cierre por')) dirExtraida = m[1];
      }

      if (!clientesDeVisitasMap.has(normKey)) {
        const etapaCalculada = v.resultadoVisita === 'Venta Cerrada' || v.resultadoVisita === 'Pedido Tomado'
          ? 'Venta'
          : (v.resultadoVisita === 'Cotización Solicitada' ? 'Cotizacion' : (v.resultadoVisita === 'Seguimiento Programado' ? 'Seguimiento' : 'Visita'));

        clientesDeVisitasMap.set(normKey, {
          id: v.clienteExternoId || `VIS-CLI-${v.id}`,
          visitaOrigenId: v.id,
          codigo: v.codigo || 'CLI-CAMPO',
          nombre: rawNombre,
          nitDoc: null,
          contacto: v.contactoAtendio || rawNombre,
          telefono: null,
          correo: null,
          ciudad: 'Cartagena',
          direccion: dirExtraida || v.observaciones || 'Registrado en visita de campo',
          sectorEconomico: v.tipoVisita || 'Comercio',
          clasificacion: 'Visitado en Campo',
          origen: 'Visita en Terreno',
          tipoRegistro: 'Cliente Potencial',
          etapaEmbudo: etapaCalculada,
          comercialId: v.usuarioId,
          comercial: v.usuario || null,
          lat: v.checkInLat || null,
          lng: v.checkInLng || null,
          notas: v.actividadesRealizadas || v.observaciones || null,
          ultimaVisitaFecha: v.checkInHora,
          createdAt: v.checkInHora || v.createdAt,
          updatedAt: v.checkOutHora || v.checkInHora || v.createdAt,
          _count: {
            visitas: 1,
            seguimientos: v.actividadesRealizadas ? 1 : 0,
            cotizaciones: 0,
            ventas: 0
          }
        });
      } else {
        const existing = clientesDeVisitasMap.get(normKey);
        existing._count.visitas += 1;
        if (v.actividadesRealizadas) existing._count.seguimientos += 1;
        if (!existing.contacto && v.contactoAtendio) existing.contacto = v.contactoAtendio;
        if ((!existing.direccion || existing.direccion === 'Registrado en visita de campo') && dirExtraida) {
          existing.direccion = dirExtraida;
        }
      }
    });

    let consolidado = [...clientesFormales, ...Array.from(clientesDeVisitasMap.values())].map(c => {
      const segs = Array.isArray(c.seguimientos) ? c.seguimientos : [];
      const segsReales = segs.filter(s => !(s.tipoAccion === 'Observacion' && String(s.resultado || '').startsWith('Registro Inicial')));
      const solicitudDelegado = segs.find(s =>
        s.tipoAccion === 'Solicitud del Delegado' ||
        String(s.resultado || '').toLowerCase().includes('exigido por delegado') ||
        String(s.resultado || '').toLowerCase().includes('solicitud del delegado')
      );
      const seguimientosPosterioresASolicitud = solicitudDelegado
        ? segsReales.filter(s => s.id !== solicitudDelegado.id && new Date(s.fechaHora) > new Date(solicitudDelegado.fechaHora))
        : [];
      const tieneSolicitudAccionPendiente = Boolean(solicitudDelegado && seguimientosPosterioresASolicitud.length === 0);

      const totalVisitas = c._count?.visitas || 0;
      const totalSegsReales = segsReales.length > 0 ? segsReales.length : (String(c.id).startsWith('VIS-CLI-') ? (c._count?.seguimientos || 0) : 0);
      const ultimaFechaGestion = segsReales[0]?.fechaHora || c.ultimaVisitaFecha || c.updatedAt || c.createdAt;
      const diasSinSeguimiento = ultimaFechaGestion ? Math.max(0, Math.floor((ahoraMs - new Date(ultimaFechaGestion).getTime()) / (24 * 3600 * 1000))) : 0;
      const sinSeguimientoPostRegistro = totalSegsReales === 0 && totalVisitas === 0;
      const requiereSeguimientoObligatorio = sinSeguimientoPostRegistro || tieneSolicitudAccionPendiente || diasSinSeguimiento >= 3;

      const limpiarTextoContacto = (val) => {
        const s = String(val || '').trim();
        if (!s) return '';
        if (/^0+$/.test(s.replace(/[\s\-().]/g, ''))) return '';
        if (/^(sin\s*tel[eé]fono|n\/a|na|ninguno|no\s*registra|pendiente)$/i.test(s)) return '';
        return s;
      };

      const contactoLimpio = limpiarTextoContacto(c.contacto);
      const telefonoLimpio = limpiarTextoContacto(c.telefono);

      return {
        ...c,
        contacto: contactoLimpio || null,
        telefono: telefonoLimpio || null,
        seguimientosRealesCount: totalSegsReales,
        sinSeguimientoPostRegistro,
        tieneSolicitudAccionPendiente,
        solicitudAccionDetalle: tieneSolicitudAccionPendiente ? {
          id: solicitudDelegado.id,
          fecha: solicitudDelegado.fechaHora,
          instrucciones: solicitudDelegado.observaciones || solicitudDelegado.compromisos || 'Realizar seguimiento comercial inmediato al cliente.',
          proximaActividad: solicitudDelegado.proximaActividad || 'Seguimiento solicitado por Gerencia'
        } : null,
        ultimaFechaGestion,
        diasSinSeguimiento,
        requiereSeguimientoObligatorio,
        estadoSeguimiento: tieneSolicitudAccionPendiente
          ? 'Solicitado por Gerencia'
          : (sinSeguimientoPostRegistro
              ? 'Primer contacto pendiente'
              : (diasSinSeguimiento >= 3
                  ? `Sin contacto hace ${diasSinSeguimiento} ${diasSinSeguimiento === 1 ? 'día' : 'días'}`
                  : 'Seguimiento al día'))
      };
    });

    if (etapa && etapa !== 'TODAS') {
      consolidado = consolidado.filter(c => (c.etapaEmbudo || 'Prospecto') === etapa);
    }
    if (tipo && tipo !== 'TODOS') {
      consolidado = consolidado.filter(c => c.tipoRegistro === tipo);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      consolidado = consolidado.filter(c =>
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.nitDoc || '').toLowerCase().includes(q) ||
        (c.contacto || '').toLowerCase().includes(q) ||
        (c.telefono || '').toLowerCase().includes(q) ||
        (c.ciudad || '').toLowerCase().includes(q) ||
        (c.comercial?.nombre || '').toLowerCase().includes(q)
      );
    }

    return consolidado;
  }

  /**
   * Obtiene un cliente externo con su historial comercial 360°
   */
  async getClienteExternoById(id) {
    if (String(id).startsWith('VIS-CLI-')) {
      const visitaId = String(id).replace('VIS-CLI-', '');
      const visitaBase = await prisma.visitaCampo.findUnique({
        where: { id: visitaId },
        include: {
          usuario: { select: { id: true, nombre: true, apellido: true, cargo: true, telefono: true } }
        }
      });
      if (!visitaBase) throw new Error('Registro de cliente en terreno no encontrado');

      const nombreTarget = (visitaBase.resultadoResumen || '').trim();
      const visitasRelacionadas = await prisma.visitaCampo.findMany({
        where: {
          resultadoResumen: { equals: nombreTarget, mode: 'insensitive' }
        },
        orderBy: { checkInHora: 'desc' },
        take: 30
      });

      return {
        id,
        codigo: visitaBase.codigo || 'CLI-CAMPO',
        nombre: nombreTarget || 'Cliente Visitado en Terreno',
        nitDoc: null,
        contacto: visitaBase.contactoAtendio || nombreTarget,
        telefono: null,
        correo: null,
        ciudad: 'Cartagena',
        direccion: visitaBase.observaciones || 'Visitado en terreno',
        sectorEconomico: visitaBase.tipoVisita || 'Comercio',
        etapaEmbudo: 'Visita',
        comercialId: visitaBase.usuarioId,
        comercial: visitaBase.usuario,
        visitas: visitasRelacionadas,
        seguimientos: visitasRelacionadas
          .filter(v => v.actividadesRealizadas || v.observaciones)
          .map(v => ({
            id: `SEG-${v.id}`,
            fechaHora: v.checkOutHora || v.checkInHora || v.createdAt,
            tipoAccion: v.tipoVisita || 'Visita en Terreno',
            resultado: v.resultadoVisita || 'Realizada',
            observaciones: `${v.actividadesRealizadas ? `${v.actividadesRealizadas}. ` : ''}${v.observaciones || ''}`.trim()
          })),
        cotizaciones: [],
        ventas: []
      };
    }

    const cliente = await prisma.clienteExternoCampo.findUnique({
      where: { id },
      include: {
        comercial: {
          select: { id: true, nombre: true, apellido: true, cargo: true, telefono: true }
        },
        visitas: {
          orderBy: { fechaProgramada: 'desc' },
          take: 20
        },
        seguimientos: {
          orderBy: { fechaHora: 'desc' },
          take: 30
        },
        cotizaciones: {
          orderBy: { fecha: 'desc' },
          take: 20
        },
        ventas: {
          orderBy: { fecha: 'desc' },
          take: 20
        }
      }
    });

    if (!cliente) throw new Error('Cliente externo no encontrado');

    // También incluir visitas registradas por nombre en VisitaCampo que aún no tenían clienteExternoId vinculado
    if (cliente.nombre) {
      const visitasPorNombre = await prisma.visitaCampo.findMany({
        where: {
          resultadoResumen: { equals: cliente.nombre.trim(), mode: 'insensitive' }
        },
        orderBy: { checkInHora: 'desc' },
        take: 20
      });
      const existingIds = new Set((cliente.visitas || []).map(v => v.id));
      visitasPorNombre.forEach(vn => {
        if (!existingIds.has(vn.id)) {
          cliente.visitas.push(vn);
        }
      });
    }

    return cliente;
  }

  /**
   * Crea un cliente externo o prospecto
   */
  async crearClienteExterno(comercialId, data) {
    const {
      nombre,
      nitDoc,
      contacto,
      telefono,
      correo,
      ciudad = 'Barranquilla',
      direccion,
      sectorEconomico = 'Comercio',
      origen = 'En Frio / Puerta a Puerta',
      tipoRegistro = 'Cliente Potencial', // "Prospecto" | "Cliente Potencial" | "Cliente Activo" | "Cliente Inactivo"
      etapaEmbudo = 'Prospecto',
      notas,
      lat,
      lng
    } = data;

    if (!nombre || !telefono) {
      throw new Error('Nombre o Razón Social y Teléfono son campos obligatorios');
    }

    const count = await prisma.clienteExternoCampo.count();
    const codigo = `CLEX-${String(count + 1).padStart(5, '0')}`;

    const nuevoCliente = await prisma.clienteExternoCampo.create({
      data: {
        codigo,
        nombre,
        nitDoc: nitDoc || null,
        contacto: contacto || null,
        telefono,
        correo: correo || null,
        ciudad,
        direccion: direccion || null,
        sectorEconomico,
        origen,
        tipoRegistro,
        etapaEmbudo,
        comercialId,
        notas: notas || null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null
      },
      include: {
        comercial: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Registrar seguimiento inicial de creación con evidencias y adjuntos si existen
    const adjuntosIniciales = Array.isArray(data.evidencias || data.adjuntos) ? (data.evidencias || data.adjuntos) : [];
    const compromisoSeg = (data.compromisoSeguimiento || data.compromisoInicial || '').trim();
    const fechaSegProg = data.fechaProximoSeguimiento || data.fechaSeguimiento || null;

    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId: nuevoCliente.id,
        usuarioId: comercialId,
        tipoAccion: compromisoSeg ? 'Seguimiento Programado' : 'Observacion',
        resultado: compromisoSeg ? `Seguimiento Programado (${tipoRegistro})` : `Registro Inicial (${tipoRegistro})`,
        observaciones: `Registro creado en etapa: ${etapaEmbudo}. Origen: ${origen}.${data.notas ? ` Notas: ${data.notas}` : ''}${compromisoSeg ? ` | Compromiso de seguimiento: ${compromisoSeg}` : ''}`,
        compromisos: compromisoSeg || 'Realizar primer seguimiento comercial obligatorio',
        proximaActividad: compromisoSeg || 'Primer seguimiento comercial post-registro',
        fechaProgramada: fechaSegProg ? new Date(fechaSegProg) : new Date(Date.now() + 24 * 3600 * 1000),
        evidencias: adjuntosIniciales
      }
    });

    return nuevoCliente;
  }

  /**
   * Modifica los datos de un cliente externo (sanitizando campos permitidos en Prisma)
   */
  async actualizarClienteExterno(id, data = {}) {
    const cleanData = {};
    const stringFields = [
      'nombre', 'nitDoc', 'contacto', 'telefono', 'correo',
      'direccion', 'ciudad', 'sectorEconomico', 'tipoRegistro',
      'clasificacion', 'etapaEmbudo', 'origen', 'notas', 'comercialId'
    ];
    for (const f of stringFields) {
      if (data[f] !== undefined) {
        cleanData[f] = data[f] !== null ? String(data[f]) : null;
      }
    }
    if (data.nit !== undefined && cleanData.nitDoc === undefined) {
      cleanData.nitDoc = data.nit ? String(data.nit) : null;
    }
    if (data.sectorActividad !== undefined && cleanData.sectorEconomico === undefined) {
      cleanData.sectorEconomico = data.sectorActividad ? String(data.sectorActividad) : null;
    }
    if (data.lat !== undefined) {
      const pLat = parseFloat(data.lat);
      cleanData.lat = !Number.isNaN(pLat) ? pLat : null;
    }
    if (data.lng !== undefined) {
      const pLng = parseFloat(data.lng);
      cleanData.lng = !Number.isNaN(pLng) ? pLng : null;
    }
    cleanData.updatedAt = new Date();

    return prisma.clienteExternoCampo.update({
      where: { id },
      data: cleanData,
      include: {
        comercial: { select: { id: true, nombre: true, apellido: true } }
      }
    });
  }

  /**
   * Cambia la etapa del embudo comercial registrando trazabilidad
   */
  async cambiarEtapaEmbudo(id, usuarioId, nuevaEtapa, nota = '') {
    const etapasValidas = [
      'Prospecto',
      'Cliente Potencial',
      'Visita',
      'Seguimiento',
      'Cotizacion',
      'Negociacion',
      'Venta',
      'Fidelizacion'
    ];

    if (!etapasValidas.includes(nuevaEtapa)) {
      throw new Error(`Etapa no válida: ${nuevaEtapa}`);
    }

    const cliente = await prisma.clienteExternoCampo.findUnique({ where: { id } });
    if (!cliente) throw new Error('Cliente no encontrado');

    const etapaAnterior = cliente.etapaEmbudo;

    const actualizado = await prisma.clienteExternoCampo.update({
      where: { id },
      data: {
        etapaEmbudo: nuevaEtapa,
        tipoRegistro: nuevaEtapa === 'Venta' || nuevaEtapa === 'Fidelizacion' ? 'Cliente Activo' : cliente.tipoRegistro,
        updatedAt: new Date()
      }
    });

    // Registrar en el historial de seguimientos
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId: id,
        usuarioId,
        tipoAccion: 'Negociacion',
        resultado: `Cambio de Etapa: ${etapaAnterior} → ${nuevaEtapa}`,
        observaciones: nota || `El cliente avanzó en el embudo a la etapa de ${nuevaEtapa}.`
      }
    });

    return actualizado;
  }

  // =================================================================
  // 2. COTIZACIONES EXTERNAS DE CAMPO
  // =================================================================

  /**
   * Lista cotizaciones externas
   */
  async getCotizacionesExternas({ usuarioId, clienteExternoId, estado, esDelegado = false }) {
    const where = {};
    if (!esDelegado && usuarioId) {
      where.comercialId = usuarioId;
    } else if (usuarioId && usuarioId !== 'TODOS') {
      where.comercialId = usuarioId;
    }
    if (clienteExternoId) where.clienteExternoId = clienteExternoId;
    if (estado && estado !== 'TODOS') where.estado = estado;

    return prisma.cotizacionExternaCampo.findMany({
      where,
      include: {
        clienteExterno: true,
        comercial: { select: { id: true, user: true, nombre: true, apellido: true, cargo: true, telefono: true, correo: true, codigoAsesor: true, firma: true } }
      },
      orderBy: { fecha: 'desc' }
    });
  }

  /**
   * Crea una cotización externa
   */
  async crearCotizacionExterna(comercialId, data) {
    const {
      clienteExternoId,
      validezDias = 15,
      estado = 'Enviada',
      items = [],
      observaciones = ''
    } = data;

    if (!clienteExternoId) throw new Error('clienteExternoId requerido');
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Debe incluir al menos un ítem en la cotización');
    }

    const total = items.reduce((acc, it) => acc + (parseFloat(it.subtotal) || (parseFloat(it.cantidad || 1) * parseFloat(it.precioUnit || 0))), 0);

    const count = await prisma.cotizacionExternaCampo.count();
    const codigo = `COTX-${String(count + 1).padStart(5, '0')}`;

    const nuevaCotizacion = await prisma.cotizacionExternaCampo.create({
      data: {
        codigo,
        clienteExternoId,
        comercialId,
        validezDias: parseInt(validezDias) || 15,
        estado,
        total,
        items,
        observaciones: observaciones || null,
        historial: [
          {
            fecha: new Date(),
            evento: 'Creación y Emisión',
            estado,
            total
          }
        ]
      },
      include: {
        clienteExterno: true,
        comercial: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Actualizar etapa de embudo del cliente a 'Cotizacion'
    await prisma.clienteExternoCampo.update({
      where: { id: clienteExternoId },
      data: { etapaEmbudo: 'Cotizacion', updatedAt: new Date() }
    });

    // Registrar seguimiento
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId,
        usuarioId: comercialId,
        tipoAccion: 'Cotizacion',
        resultado: `Cotización Emitida (${codigo})`,
        observaciones: `Se entregó cotización por valor de $${total.toLocaleString()}. Ítems: ${items.length}.`
      }
    });

    return nuevaCotizacion;
  }

  /**
   * Actualiza los datos completos de una cotización externa (ítems, total, estado, observaciones, cliente)
   */
  async actualizarCotizacionExterna(id, usuarioId, data = {}) {
    const cotiz = await prisma.cotizacionExternaCampo.findUnique({ where: { id } });
    if (!cotiz) throw new Error('Cotización externa no encontrada');

    const items = Array.isArray(data.items) ? data.items : cotiz.items;
    const calculatedTotal = Array.isArray(items) && items.length > 0
      ? items.reduce((acc, it) => acc + (parseFloat(it.subtotal ?? it.tot) || (parseFloat(it.cantidad ?? it.cant ?? 1) * parseFloat(it.precioUnit ?? it.precio ?? 0))), 0)
      : cotiz.total;
    const total = data.total !== undefined && !Number.isNaN(parseFloat(data.total))
      ? parseFloat(data.total)
      : calculatedTotal;

    const nuevoEstado = data.estado || cotiz.estado;
    const historialPrevio = Array.isArray(cotiz.historial) ? cotiz.historial : [];

    const actualizado = await prisma.cotizacionExternaCampo.update({
      where: { id },
      data: {
        ...(data.clienteExternoId ? { clienteExternoId: data.clienteExternoId } : {}),
        ...(data.validezDias !== undefined ? { validezDias: parseInt(data.validezDias) || 15 } : {}),
        estado: nuevoEstado,
        total,
        items,
        observaciones: data.observaciones !== undefined ? data.observaciones : (data.notas !== undefined ? data.notas : cotiz.observaciones),
        historial: [
          ...historialPrevio,
          {
            fecha: new Date(),
            evento: 'Actualización de Cotización',
            estadoAnterior: cotiz.estado,
            nuevoEstado,
            total
          }
        ],
        updatedAt: new Date()
      },
      include: {
        clienteExterno: true,
        comercial: { select: { id: true, user: true, nombre: true, apellido: true, cargo: true, telefono: true, correo: true, codigoAsesor: true, firma: true } }
      }
    });

    return actualizado;
  }

  /**
   * Elimina una cotización externa por ID
   */
  async eliminarCotizacionExterna(id) {
    return prisma.cotizacionExternaCampo.delete({ where: { id } });
  }

  /**
   * Elimina todas las cotizaciones externas (opcionalmente filtradas por comercial)
   */
  async eliminarTodasCotizacionesExternas(comercialId = null) {
    const where = comercialId && comercialId !== 'TODOS' ? { comercialId } : {};
    return prisma.cotizacionExternaCampo.deleteMany({ where });
  }

  /**
   * Modifica el estado de una cotización externa (Aprobar, Rechazar, Enviar, Negociar)
   */
  async cambiarEstadoCotizacion(id, usuarioId, nuevoEstado, nota = '') {
    const cotiz = await prisma.cotizacionExternaCampo.findUnique({ where: { id } });
    if (!cotiz) throw new Error('Cotización no encontrada');

    const estadoAnterior = cotiz.estado;
    const historialPrevio = Array.isArray(cotiz.historial) ? cotiz.historial : [];

    const actualizado = await prisma.cotizacionExternaCampo.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        historial: [
          ...historialPrevio,
          {
            fecha: new Date(),
            estadoAnterior,
            nuevoEstado,
            nota
          }
        ],
        updatedAt: new Date()
      },
      include: {
        clienteExterno: true,
        comercial: { select: { id: true, nombre: true, apellido: true } }
      }
    });

    // Si pasa a negociación o aprobada, mover embudo
    if (nuevoEstado === 'En Negociacion') {
      await prisma.clienteExternoCampo.update({
        where: { id: cotiz.clienteExternoId },
        data: { etapaEmbudo: 'Negociacion', updatedAt: new Date() }
      });
    }

    // Registrar seguimiento
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId: cotiz.clienteExternoId,
        usuarioId,
        tipoAccion: 'Cotizacion',
        resultado: `Cotización ${cotiz.codigo}: ${nuevoEstado}`,
        observaciones: nota || `Estado actualizado de ${estadoAnterior} a ${nuevoEstado}.`
      }
    });

    return actualizado;
  }

  /**
   * Agrega un seguimiento interno a una cotización
   */
  async agregarSeguimientoCotizacion(id, usuarioId, { accion, nota, usuarioNombre }) {
    const cotiz = await prisma.cotizacionExternaCampo.findUnique({ where: { id } });
    if (!cotiz) throw new Error('Cotización no encontrada');

    const seguimientosPrevios = Array.isArray(cotiz.seguimientos) ? cotiz.seguimientos : [];

    const actualizado = await prisma.cotizacionExternaCampo.update({
      where: { id },
      data: {
        seguimientos: [
          ...seguimientosPrevios,
          {
            fecha: new Date(),
            usuario: usuarioNombre || 'Comercial',
            accion,
            nota
          }
        ],
        updatedAt: new Date()
      }
    });

    return actualizado;
  }

  // =================================================================
  // 3. VENTAS EXTERNAS DE CAMPO
  // =================================================================

  /**
   * Lista ventas externas
   */
  async getVentasExternas({ usuarioId, clienteExternoId, esDelegado = false }) {
    const where = {};
    if (!esDelegado && usuarioId) {
      where.comercialId = usuarioId;
    } else if (usuarioId && usuarioId !== 'TODOS') {
      where.comercialId = usuarioId;
    }
    if (clienteExternoId) where.clienteExternoId = clienteExternoId;

    return prisma.ventaExternaCampo.findMany({
      where,
      include: {
        clienteExterno: true,
        cotizacion: true,
        comercial: { select: { id: true, user: true, nombre: true, apellido: true, cargo: true, telefono: true, correo: true, codigoAsesor: true, firma: true } }
      },
      orderBy: { fecha: 'desc' }
    });
  }

  /**
   * Registra una venta externa cerrada en campo
   */
  async registrarVentaExterna(comercialId, data) {
    const {
      clienteExternoId: rawClienteExternoId,
      clienteNombre = '',
      clienteTelefono = '',
      clienteDireccion = '',
      cotizacionId = null,
      valorVendido,
      metodoPago = 'Contado',
      observaciones = '',
      compromisoSeguimiento = '',
      fechaProximoSeguimiento = null,
      numeroFactura = '',
      items = []
    } = data;

    const valor = parseFloat(valorVendido);
    if (isNaN(valor) || valor <= 0) {
      throw new Error('El valor vendido debe ser un número positivo');
    }

    // Resolver o crear el ClienteExternoCampo si viene de visita en terreno (VIS-CLI-...) o por nombre
    let clienteExternoId = rawClienteExternoId;
    if (clienteExternoId && String(clienteExternoId).startsWith('VIS-CLI-')) {
      const visitaId = String(clienteExternoId).replace('VIS-CLI-', '');
      const vis = await prisma.visitaCampo.findUnique({ where: { id: visitaId } }).catch(() => null);
      const nomBuscar = (vis?.resultadoResumen || clienteNombre || 'Cliente de Campo').trim();
      let existente = await prisma.clienteExternoCampo.findFirst({
        where: { nombre: { equals: nomBuscar, mode: 'insensitive' } }
      });
      if (!existente) {
        const cCount = await prisma.clienteExternoCampo.count();
        existente = await prisma.clienteExternoCampo.create({
          data: {
            codigo: `CLEX-${String(cCount + 1).padStart(5, '0')}`,
            nombre: nomBuscar,
            contacto: vis?.contactoAtendio || nomBuscar,
            telefono: clienteTelefono || 'Registrado en campo',
            ciudad: 'Cartagena',
            direccion: vis?.observaciones || clienteDireccion || 'Visitado en terreno',
            sectorEconomico: vis?.tipoVisita || 'Comercio',
            origen: 'Visita en Terreno',
            tipoRegistro: 'Cliente Activo',
            etapaEmbudo: 'Venta',
            comercialId
          }
        });
      }
      clienteExternoId = existente.id;
    } else if (clienteExternoId) {
      const checkFormal = await prisma.clienteExternoCampo.findUnique({ where: { id: clienteExternoId } }).catch(() => null);
      if (!checkFormal) {
        const checkInterno = await prisma.cliente.findUnique({ where: { id: clienteExternoId } }).catch(() => null);
        const nomCrear = (checkInterno?.nom || clienteNombre || 'Cliente Comercial').trim();
        let existentePorNombre = await prisma.clienteExternoCampo.findFirst({
          where: { nombre: { equals: nomCrear, mode: 'insensitive' } }
        });
        if (!existentePorNombre) {
          const cCount = await prisma.clienteExternoCampo.count();
          existentePorNombre = await prisma.clienteExternoCampo.create({
            data: {
              codigo: `CLEX-${String(cCount + 1).padStart(5, '0')}`,
              nombre: nomCrear,
              nitDoc: checkInterno?.nit || null,
              contacto: checkInterno?.contacto || nomCrear,
              telefono: checkInterno?.tel || clienteTelefono || 'Registrado en campo',
              ciudad: checkInterno?.ciudad || 'Cartagena',
              direccion: checkInterno?.dir || clienteDireccion || null,
              sectorEconomico: 'Comercio',
              origen: 'Venta Directa en Campo',
              tipoRegistro: 'Cliente Activo',
              etapaEmbudo: 'Venta',
              comercialId
            }
          });
        }
        clienteExternoId = existentePorNombre.id;
      }
    } else if (clienteNombre && String(clienteNombre).trim()) {
      const nomBuscar = String(clienteNombre).trim();
      let existente = await prisma.clienteExternoCampo.findFirst({
        where: { nombre: { equals: nomBuscar, mode: 'insensitive' } }
      });
      if (!existente) {
        const cCount = await prisma.clienteExternoCampo.count();
        existente = await prisma.clienteExternoCampo.create({
          data: {
            codigo: `CLEX-${String(cCount + 1).padStart(5, '0')}`,
            nombre: nomBuscar,
            contacto: nomBuscar,
            telefono: clienteTelefono || 'Registrado en campo',
            ciudad: 'Cartagena',
            direccion: clienteDireccion || 'Registrado en venta del día',
            sectorEconomico: 'Comercio',
            origen: 'Venta Directa en Campo',
            tipoRegistro: 'Cliente Activo',
            etapaEmbudo: 'Venta',
            comercialId
          }
        });
      }
      clienteExternoId = existente.id;
    }

    if (!clienteExternoId) {
      throw new Error('Debe seleccionar o indicar el nombre del cliente para registrar la venta');
    }

    const count = await prisma.ventaExternaCampo.count();
    let codigo = `VTEX-${String(count + 1).padStart(5, '0')}`;
    const existeCod = await prisma.ventaExternaCampo.findUnique({ where: { codigo } }).catch(() => null);
    if (existeCod) {
      codigo = `VTEX-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
    }

    const obsFinal = [
      numeroFactura ? `Factura/Pedido: ${numeroFactura}` : '',
      observaciones ? String(observaciones).trim() : '',
      compromisoSeguimiento ? `Compromiso de seguimiento: ${String(compromisoSeguimiento).trim()}` : ''
    ].filter(Boolean).join(' | ');

    const nuevaVenta = await prisma.ventaExternaCampo.create({
      data: {
        codigo,
        clienteExternoId,
        comercialId,
        cotizacionId: cotizacionId || null,
        valorVendido: valor,
        metodoPago,
        observaciones: obsFinal || null,
        items: Array.isArray(items) && items.length > 0 ? items : null,
        estado: 'Cerrada'
      },
      include: {
        clienteExterno: true,
        cotizacion: true,
        comercial: { select: { id: true, nombre: true, apellido: true, cargo: true } }
      }
    });

    // 1. Marcar cliente como "Cliente Activo" y en etapa "Venta"
    await prisma.clienteExternoCampo.update({
      where: { id: clienteExternoId },
      data: {
        tipoRegistro: 'Cliente Activo',
        etapaEmbudo: 'Venta',
        updatedAt: new Date()
      }
    });

    // 2. Si tenía cotización asociada, marcarla como "Aprobada"
    if (cotizacionId) {
      await prisma.cotizacionExternaCampo.update({
        where: { id: cotizacionId },
        data: {
          estado: 'Aprobada',
          updatedAt: new Date()
        }
      }).catch(() => {});
    }

    // 3. Registrar seguimiento comercial y compromiso post-venta obligatorio
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId,
        usuarioId: comercialId,
        tipoAccion: 'Venta',
        resultado: `Venta del Día Cerrada (${codigo})`,
        observaciones: `Cierre comercial por valor de $${valor.toLocaleString('es-CO')}. Método: ${metodoPago}.${obsFinal ? ` ${obsFinal}` : ''}`,
        compromisos: compromisoSeguimiento || 'Seguimiento post-venta y verificación de entrega/satisfacción',
        proximaActividad: compromisoSeguimiento || 'Seguimiento post-venta al cliente',
        fechaProgramada: fechaProximoSeguimiento ? new Date(fechaProximoSeguimiento) : new Date(Date.now() + 2 * 24 * 3600 * 1000)
      }
    });

    return nuevaVenta;
  }

  /**
   * Actualiza los datos completos de una venta/pedido externo
   */
  async actualizarVentaExterna(id, usuarioId, data = {}) {
    const venta = await prisma.ventaExternaCampo.findUnique({ where: { id } });
    if (!venta) throw new Error('Venta externa no encontrada');

    const items = Array.isArray(data.items) ? data.items : venta.items;
    const calculatedTotal = Array.isArray(items) && items.length > 0
      ? items.reduce((acc, it) => acc + (parseFloat(it.subtotal ?? it.tot) || (parseFloat(it.cantidad ?? it.cant ?? 1) * parseFloat(it.precioUnit ?? it.precio ?? 0))), 0)
      : venta.valorVendido;
    const rawValor = data.valorVendido !== undefined ? data.valorVendido : data.total;
    const valorVendido = rawValor !== undefined && !Number.isNaN(parseFloat(rawValor))
      ? parseFloat(rawValor)
      : calculatedTotal;

    const actualizado = await prisma.ventaExternaCampo.update({
      where: { id },
      data: {
        ...(data.clienteExternoId ? { clienteExternoId: data.clienteExternoId } : {}),
        ...(data.cotizacionId !== undefined ? { cotizacionId: data.cotizacionId || null } : {}),
        ...(data.metodoPago ? { metodoPago: data.metodoPago } : {}),
        ...(data.estado ? { estado: data.estado } : {}),
        valorVendido,
        items,
        observaciones: data.observaciones !== undefined ? data.observaciones : (data.notas !== undefined ? data.notas : venta.observaciones),
        updatedAt: new Date()
      },
      include: {
        clienteExterno: true,
        cotizacion: true,
        comercial: { select: { id: true, user: true, nombre: true, apellido: true, cargo: true, telefono: true, correo: true, codigoAsesor: true, firma: true } }
      }
    });

    return actualizado;
  }

  /**
   * Elimina una venta externa por ID
   */
  async eliminarVentaExterna(id) {
    return prisma.ventaExternaCampo.delete({ where: { id } });
  }

  /**
   * Elimina todas las ventas externas (opcionalmente filtradas por comercial)
   */
  async eliminarTodasVentasExternas(comercialId = null) {
    const where = comercialId && comercialId !== 'TODOS' ? { comercialId } : {};
    return prisma.ventaExternaCampo.deleteMany({ where });
  }

  // =================================================================
  // 4. MÉTRICAS CONSOLIDADAS DEL EMBUDO DE CAMPO
  // =================================================================

  /**
   * Resumen del embudo operativo de 8 etapas
   */
  async getMetricasEmbudo(usuarioId = null) {
    const where = {};
    if (usuarioId && usuarioId !== 'TODOS') where.comercialId = usuarioId;

    const clientes = await prisma.clienteExternoCampo.findMany({
      where,
      select: { etapaEmbudo: true, tipoRegistro: true }
    });

    const conteo = {
      prospecto: clientes.filter(c => c.etapaEmbudo === 'Prospecto').length,
      clientePotencial: clientes.filter(c => c.etapaEmbudo === 'Cliente Potencial').length,
      visita: clientes.filter(c => c.etapaEmbudo === 'Visita').length,
      seguimiento: clientes.filter(c => c.etapaEmbudo === 'Seguimiento').length,
      cotizacion: clientes.filter(c => c.etapaEmbudo === 'Cotizacion').length,
      negociacion: clientes.filter(c => c.etapaEmbudo === 'Negociacion').length,
      venta: clientes.filter(c => c.etapaEmbudo === 'Venta').length,
      fidelizacion: clientes.filter(c => c.etapaEmbudo === 'Fidelizacion').length,
      total: clientes.length
    };

    return conteo;
  }

  /**
   * Elimina un cliente externo y limpia sus relaciones en cascada
   */
  async eliminarClienteExterno(id) {
    const cliente = await prisma.clienteExternoCampo.findUnique({ where: { id } });
    if (!cliente) throw new Error('Cliente externo no encontrado');

    await prisma.seguimientoCampo.deleteMany({ where: { clienteExternoId: id } }).catch(() => {});
    await prisma.cotizacionExternaCampo.deleteMany({ where: { clienteExternoId: id } }).catch(() => {});
    await prisma.ventaExternaCampo.deleteMany({ where: { clienteExternoId: id } }).catch(() => {});
    await prisma.visitaCampo.deleteMany({ where: { clienteExternoId: id } }).catch(() => {});

    return prisma.clienteExternoCampo.delete({ where: { id } });
  }

  /**
   * Elimina todos los clientes externos con confirmación y cascada
   */
  async eliminarTodosClientesExternos({ usuarioId = null, esDelegado = false }) {
    const where = {};
    if (!esDelegado && usuarioId) {
      where.comercialId = usuarioId;
    } else if (usuarioId && usuarioId !== 'TODOS') {
      where.comercialId = usuarioId;
    }

    const clientes = await prisma.clienteExternoCampo.findMany({ where, select: { id: true } });
    const ids = clientes.map(c => c.id);

    if (ids.length === 0) return { count: 0 };

    await prisma.seguimientoCampo.deleteMany({ where: { clienteExternoId: { in: ids } } }).catch(() => {});
    await prisma.cotizacionExternaCampo.deleteMany({ where: { clienteExternoId: { in: ids } } }).catch(() => {});
    await prisma.ventaExternaCampo.deleteMany({ where: { clienteExternoId: { in: ids } } }).catch(() => {});
    await prisma.visitaCampo.deleteMany({ where: { clienteExternoId: { in: ids } } }).catch(() => {});

    return prisma.clienteExternoCampo.deleteMany({ where: { id: { in: ids } } });
  }

  // =================================================================
  // CLASIFICACIONES DE CLIENTES PARAMETRIZABLES
  // =================================================================
  async getClasificaciones(incluirInactivos = false) {
    const fallbackList = [
      { id: 'def-1', nombre: 'Cliente Comercial', colorHex: '#1E88FF', activo: true, esSistema: true },
      { id: 'def-2', nombre: 'Distribuidor Mayorista', colorHex: '#10B981', activo: true, esSistema: true },
      { id: 'def-3', nombre: 'Restaurante / Hotel', colorHex: '#F59E0B', activo: true, esSistema: true },
      { id: 'def-4', nombre: 'Punto de Venta / Retail', colorHex: '#8B5CF6', activo: true, esSistema: true },
      { id: 'def-5', nombre: 'Prospecto Frío', colorHex: '#64748B', activo: true, esSistema: true }
    ];

    try {
      if (prisma.clasificacionClienteCampo) {
        const where = incluirInactivos ? {} : { activo: true };
        const items = await prisma.clasificacionClienteCampo.findMany({
          where,
          orderBy: { nombre: 'asc' }
        });
        if (items && items.length > 0) return items;
      }
      return fallbackList;
    } catch (err) {
      console.warn('[OperacionExternaService] getClasificaciones fallback:', err.message);
      return fallbackList;
    }
  }

  async crearClasificacion(data) {
    if (!data.nombre || !data.nombre.trim()) {
      throw new Error('El nombre de la clasificación es obligatorio');
    }
    const nombre = data.nombre.trim();
    if (prisma.clasificacionClienteCampo) {
      return prisma.clasificacionClienteCampo.create({
        data: {
          nombre,
          descripcion: data.descripcion || '',
          colorHex: data.colorHex || '#1E88FF',
          activo: data.activo !== false,
          esSistema: false
        }
      });
    }
    return { id: `clasif-${Date.now()}`, nombre, colorHex: data.colorHex || '#1E88FF', activo: true };
  }

  async actualizarClasificacion(id, data) {
    if (prisma.clasificacionClienteCampo) {
      return prisma.clasificacionClienteCampo.update({
        where: { id },
        data: {
          ...(data.nombre && { nombre: data.nombre.trim() }),
          ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
          ...(data.colorHex && { colorHex: data.colorHex }),
          ...(data.activo !== undefined && { activo: Boolean(data.activo) })
        }
      });
    }
    return { id, ...data };
  }

  async eliminarClasificacion(id) {
    if (prisma.clasificacionClienteCampo) {
      return prisma.clasificacionClienteCampo.delete({
        where: { id }
      });
    }
    return { success: true };
  }
}

module.exports = new OperacionExternaService();

