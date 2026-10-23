const prisma = require('../../prisma');

class OperacionExternaService {
  // =================================================================
  // 1. GESTIÓN DE CLIENTES EXTERNOS Y PROSPECTOS
  // =================================================================

  /**
   * Obtiene la cartera de clientes externos y prospectos con filtros
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

    return prisma.clienteExternoCampo.findMany({
      where,
      include: {
        comercial: {
          select: { id: true, nombre: true, apellido: true, cargo: true }
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
    });
  }

  /**
   * Obtiene un cliente externo con su historial comercial 360°
   */
  async getClienteExternoById(id) {
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
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId: nuevoCliente.id,
        usuarioId: comercialId,
        tipoAccion: 'Observacion',
        resultado: `Registro Inicial (${tipoRegistro})`,
        observaciones: `Registro creado en etapa: ${etapaEmbudo}. Origen: ${origen}.${data.notas ? ` Notas: ${data.notas}` : ''}`,
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
      clienteExternoId,
      cotizacionId = null,
      valorVendido,
      metodoPago = 'Contado',
      observaciones = '',
      items = []
    } = data;

    if (!clienteExternoId || !valorVendido) {
      throw new Error('clienteExternoId y valorVendido son obligatorios');
    }

    const valor = parseFloat(valorVendido);
    if (isNaN(valor) || valor <= 0) {
      throw new Error('El valor vendido debe ser un número positivo');
    }

    const count = await prisma.ventaExternaCampo.count();
    const codigo = `VTEX-${String(count + 1).padStart(5, '0')}`;

    const nuevaVenta = await prisma.ventaExternaCampo.create({
      data: {
        codigo,
        clienteExternoId,
        comercialId,
        cotizacionId: cotizacionId || null,
        valorVendido: valor,
        metodoPago,
        observaciones: observaciones || null,
        items: items.length > 0 ? items : null,
        estado: 'Cerrada'
      },
      include: {
        clienteExterno: true,
        cotizacion: true,
        comercial: { select: { id: true, nombre: true, apellido: true } }
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
      });
    }

    // 3. Registrar seguimiento comercial
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId,
        usuarioId: comercialId,
        tipoAccion: 'Venta',
        resultado: `Venta Cerrada (${codigo})`,
        observaciones: `Cierre comercial por valor de $${valor.toLocaleString()}. Método: ${metodoPago}. ${observaciones}`
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

