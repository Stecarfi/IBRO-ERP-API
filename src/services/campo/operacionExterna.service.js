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

    // Registrar seguimiento inicial de creación
    await prisma.seguimientoCampo.create({
      data: {
        clienteExternoId: nuevoCliente.id,
        usuarioId: comercialId,
        tipoAccion: 'Observacion',
        resultado: `Registro Inicial (${tipoRegistro})`,
        observaciones: `Registro creado en etapa: ${etapaEmbudo}. Origen: ${origen}.`
      }
    });

    return nuevoCliente;
  }

  /**
   * Modifica los datos de un cliente externo
   */
  async actualizarClienteExterno(id, data) {
    return prisma.clienteExternoCampo.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      },
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
        comercial: { select: { id: true, nombre: true, apellido: true } }
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
        comercial: { select: { id: true, nombre: true, apellido: true } }
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
}

module.exports = new OperacionExternaService();
