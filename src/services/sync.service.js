const prisma = require('../prisma');

class SyncService {
  async getDb() {
    const users = await prisma.user.findMany({
      select: {
        id: true, nombre: true, apellido: true, cedula: true, tipoDoc: true,
        correo: true, cargo: true, telefono: true, observaciones: true,
        user: true, roleId: true, meta_u: true, ejec_u: true, meta_p: true,
        ejec_p: true, soundsEnabled: true, cumpleanos: true,
        habeasDataAccepted: true, failedLoginAttempts: true, isLocked: true,
        lastLogin: true, isOnline: true, foto: true, lat: true, lng: true,
        lastLocationUpdate: true, codigoAsesor: true
      },
      orderBy: { id: 'asc' }
    });
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' } });
    const clientes = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
    const inventario = await prisma.inventario.findMany({ orderBy: { id: 'asc' } });
    
    // Mapear Ventas (incluyendo Cliente y Producto)
    const ventasRaw = await prisma.venta.findMany({
      include: { cliente: true, producto: true },
      orderBy: { id: 'asc' }
    });
    const ventas = ventasRaw.map(v => ({
      id: v.id,
      fecha: v.fecha,
      fechaIso: v.fechaIso,
      venceGarantiaIso: v.venceGarantiaIso,
      mesesGarantia: v.mesesGarantia,
      vendedor: v.vendedor,
      docCli: v.cliente.doc,
      cliente: v.cliente.nom,
      idProd: v.productoId,
      producto: v.producto.ref,
      cant: v.cant,
      desc: v.desc,
      metodoPago: v.metodoPago,
      total: v.total,
      comisionistaId: v.comisionistaId,
      comisionistaNombre: v.comisionistaNombre,
      comisionistaPct: v.comisionistaPct,
      comisionistaValor: v.comisionistaValor,
      tipo_precio: v.tipo_precio,
      precioUnitario: v.precioUnitario,
      lockedBy: v.lockedBy,
      serialEquipo: v.serialEquipo,
      vendedorNombre: v.vendedorNombre,
      vendedorCargo: v.vendedorCargo,
      vendedorEmail: v.vendedorEmail,
      vendedorMovil: v.vendedorMovil,
      vendedorCodigoAsesor: v.vendedorCodigoAsesor,
      estadoComision: v.estadoComision,
      fechaComision: v.fechaComision,
      equipos: v.equipos ? JSON.parse(v.equipos) : [],
      materiales: v.materiales ? JSON.parse(v.materiales) : []
    }));

    // Mapear PQRS
    const pqrsRaw = await prisma.pQR.findMany({
      include: { cliente: true },
      orderBy: { id: 'asc' }
    });
    const pqrs = pqrsRaw.map(p => ({
      id: p.id,
      fecha: p.fecha,
      limiteIso: p.limiteIso,
      docCli: p.cliente.doc,
      cliente: p.cliente.nom,
      tipo: p.tipo,
      detalle: p.detalle,
      evidencia: p.evidencia,
      fileData: p.fileData,
      estado: p.estado,
      satisfecho: p.satisfecho,
      lockedBy: p.lockedBy,
      radicado: p.radicado,
      hechos: p.hechos,
      solicitudes: p.solicitudes,
      evidencias: p.evidencias,
      aplicaGarantia: p.aplicaGarantia,
      tratamientoGarantia: p.tratamientoGarantia,
      terminoLegal: p.terminoLegal,
      fechaCierre: p.fechaCierre,
      inventarioId: p.inventarioId,
      ventaId: p.ventaId,
      cotizacionId: p.cotizacionId,
      trazabilidad: p.trazabilidad,
      usuarioAsignado: p.usuarioAsignado
    }));

    // Mapear Servicios T├®cnicos
    const serviciosRaw = await prisma.servicio.findMany({
      include: { cliente: true },
      orderBy: { id: 'asc' }
    });
    const servicios = serviciosRaw.map(s => ({
      id: s.id,
      docCli: s.cliente.doc,
      cliente: s.cliente.nom,
      fechaProg: s.fechaProg,
      tipo: s.tipo,
      obs: s.obs,
      estado: s.estado,
      obsAdmin: s.obsAdmin,
      lockedBy: s.lockedBy,
      tecnico: s.tecnico || '',
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

    const solicitudesRaw = await prisma.solicitud.findMany({ orderBy: { id: 'asc' } });
    const solicitudes = solicitudesRaw.map(s => ({
      id: s.id,
      fecha: s.fecha,
      asesor: s.asesor,
      nombreAsesor: s.nombreAsesor || '',
      tipo: s.tipo,
      detalle: s.detalle || '',
      evidencia: s.evidencia || null,
      fileData: s.fileData || null,
      estado: s.estado,
      lockedBy: s.lockedBy || null,
      comentario: s.comentario || '',
      fechaRadicado: s.fechaRadicado || ''
    }));

    const procesosDisciplinarios = await prisma.procesoDisciplinario.findMany({ orderBy: { id: 'asc' } });

    const evaluacionesRaw = await prisma.evaluacion.findMany({ orderBy: { id: 'asc' } });
    const evaluaciones = evaluacionesRaw.map(ev => ({
      id: ev.id,
      fecha: ev.fecha,
      evaluador: ev.evaluador || '',
      evaluado: ev.evaluado || '',
      evaluadoNombre: ev.evaluadoNombre || '',
      tipo: ev.tipo || '',
      obs: ev.obs || '',
      lockedBy: ev.lockedBy || null,
      empleado: ev.empleado || '',
      metajobs: ev.metajobs || 5,
      asistencia: ev.asistencia || 5,
      objetivos: ev.objetivos || 5,
      promedio: ev.promedio || 5.0,
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
      include: { cliente: true, producto: true },
      orderBy: { id: 'asc' }
    });
    const cotizaciones = cotizacionesRaw.map(c => ({
      id: c.id,
      numCotizacion: c.numCotizacion,
      fecha: c.fecha,
      vendedor: c.vendedor,
      docCli: c.cliente.doc,
      cliente: c.cliente.nom,
      idProd: c.productoId,
      producto: c.producto.ref,
      cant: c.cant,
      desc: c.desc,
      total: c.total,
      comisionistaId: c.comisionistaId,
      comisionistaNombre: c.comisionistaNombre,
      comisionistaPct: c.comisionistaPct,
      comisionistaValor: c.comisionistaValor,
      lockedBy: c.lockedBy,
      contacto: c.contacto,
      condiciones: c.condiciones,
      tiempoEntrega: c.tiempoEntrega,
      direccionEntrega: c.direccionEntrega,
      detallePagoMixto: c.detallePagoMixto,
      cuentas: c.cuentas,
      firmanteNombre: c.firmanteNombre,
      firmanteCargo: c.firmanteCargo,
      firmanteCorreo: c.firmanteCorreo,
      firmanteMovil: c.firmanteMovil,
      garantia: c.garantia,
      observacion: c.observacion,
      vendedorNombre: c.vendedorNombre,
      vendedorCargo: c.vendedorCargo,
      vendedorEmail: c.vendedorEmail,
      vendedorMovil: c.vendedorMovil,
      vendedorCodigoAsesor: c.vendedorCodigoAsesor,
      vigencia: c.vigencia,
      ivaTipo: c.ivaTipo,
      equipos: c.equipos ? JSON.parse(c.equipos) : [],
      materiales: c.materiales ? JSON.parse(c.materiales) : [],
      tipo_precio: c.tipo_precio,
      precioUnitario: c.precioUnitario,
      fechaSeguimiento: c.fechaSeguimiento,
      estadoSeguimiento: c.estadoSeguimiento,
      motivoSeguimiento: c.motivoSeguimiento,
      motivoNoCompra: c.motivoNoCompra
    }));

    const chatGroupsRaw = await prisma.chatGroup.findMany({ orderBy: { fecha: 'asc' } });
    const chatGroups = chatGroupsRaw.map(g => ({
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion || '',
      createdBy: g.createdBy,
      fecha: g.fecha,
      integrantes: g.integrantes ? JSON.parse(g.integrantes) : []
    }));

    const chatDesc = await prisma.chat.findMany({ orderBy: { timestamp: 'desc' }, take: 150 });
    const chat = chatDesc.reverse();
    const auditoriaDesc = await prisma.auditoria.findMany({ orderBy: { id: 'desc' }, take: 200 });
    const auditoria = auditoriaDesc.reverse();
    const notificacionesDesc = await prisma.notificacion.findMany({ orderBy: { id: 'desc' }, take: 100 });
    const notificaciones = notificacionesDesc.reverse();
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
      items: c.items ? JSON.parse(c.items) : [],
      nequi: c.nequi || '',
      titular: c.titular || '',
      estado: c.estado || '',
      total: c.total || 0
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
      porcentaje: c.porcentaje || 10
    }));

    // WhatsApp Config
    const config = await prisma.whatsappConfig.findFirst();
    const whatsappConfig = config ? { phone: config.phone, status: config.status } : { phone: '', status: 'Activo' };
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

    const capacitacionesRaw = await prisma.capacitacion.findMany({ orderBy: { fecha: 'desc' } });
    const capacitaciones = capacitacionesRaw.map(c => ({
      id: c.id,
      tema: c.tema,
      descripcion: c.descripcion || '',
      fecha: c.fecha,
      hora: c.hora,
      obligatoria: c.obligatoria,
      creador: c.creador,
      videoLink: c.videoLink || '',
      materiales: c.materiales ? JSON.parse(c.materiales) : [],
      asistentes: c.asistentes ? JSON.parse(c.asistentes) : [],
      evaluacion: c.evaluacion ? JSON.parse(c.evaluacion) : null,
      estado: c.estado,
      lockedBy: c.lockedBy
    }));

    const pendingResets = await prisma.pendingReset.findMany({ orderBy: { id: 'asc' } });
    return {
      users, roles, clientes, inventario, ventas, pqrs, servicios,
      solicitudes, procesosDisciplinarios, evaluaciones, anuncios,
      cotizaciones, chatGroups, chat, auditoria, notificaciones, cuentasCobro, comisionistas, informesConfig, capacitaciones, pendingResets, config: appConfig, whatsappConfig
    };
  }

  async sync(diff, user) {
    await prisma.$transaction(async (tx) => {
      // Helper para upserts en tablas planas directas
      const flatUpsert = async (table, items) => {
        for (const item of items) {
          const { ...data } = item;

        if (table === 'user') {
          // Ya permitimos que foto se guarde y sincronice
        }

        // Evitar conflictos por llaves ├║nicas (como doc en Clientes o user en Usuarios)
        if (table === 'cliente' && item.doc) {
          const existing = await tx.cliente.findUnique({ where: { doc: item.doc } });
          if (existing) {
            delete data.id;
            await tx.cliente.update({
              where: { id: existing.id },
              data
            });
            continue;
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
            await tx.user.update({
              where: { id: existing.id },
              data
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

      // Optimistic Concurrency Control (OCC) - Prevenci├│n Anti-Sobrescritura
      try {
        const existingRecord = await tx[table].findUnique({ where: { id: item.id } });
        if (existingRecord && existingRecord.lockedBy && existingRecord.lockedBy !== user) {
          console.warn(`[OCC BLOCK] Usuario '${user}' intent├│ sobrescribir '${table}' ID '${item.id}' que est├í bloqueado por '${existingRecord.lockedBy}'. Sincronizaci├│n denegada para este registro.`);
          continue; // Saltar la actualizaci├│n para no corromper datos del otro asesor
        }
      } catch (e) {
        // Ignorar si la tabla no soporta findUnique por ID u otras razones
      }

      await tx[table].upsert({
        where: { id: item.id },
        update: data,
        create: data,
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
          fecha: item.fecha,
          fechaIso: item.fechaIso,
          venceGarantiaIso: item.venceGarantiaIso,
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

        await tx.venta.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
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
          fecha: item.fecha,
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

        await tx.cotizacion.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
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

        const data = {
          fecha: item.fecha,
          limiteIso: item.limiteIso,
          clienteId: client.id,
          tipo: item.tipo,
          detalle: item.detalle,
          evidencia: item.evidencia || null,
          fileData: item.fileData || null,
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
          usuarioAsignado: item.usuarioAsignado || null,
        };

        await tx.pQR.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
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
          fechaProg: item.fechaProg,
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

        await tx.servicio.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
        });
      }
    }

    // --- FASE 3: Otras Tablas Planas ---

    // 9. Solicitudes Laborales
    if (diff.solicitudes) {
      await flatUpsert('solicitud', diff.solicitudes.upserted || []);
      await flatDelete('solicitud', diff.solicitudes.deleted || []);
    }

    // 10. Procesos Disciplinarios
    if (diff.procesosDisciplinarios) {
      await flatUpsert('procesoDisciplinario', diff.procesosDisciplinarios.upserted || []);
      await flatDelete('procesoDisciplinario', diff.procesosDisciplinarios.deleted || []);
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
      await flatUpsert('chat', diff.chat.upserted || []);
      await flatDelete('chat', diff.chat.deleted || []);
    }

    // 13.5 Grupos de Chat
    if (diff.chatGroups) {
      await flatUpsert('chatGroup', diff.chatGroups.upserted || []);
      await flatDelete('chatGroup', diff.chatGroups.deleted || []);
    }

    // 14. Auditor├¡a
    if (diff.auditoria) {
      await flatUpsert('auditoria', diff.auditoria.upserted || []);
      await flatDelete('auditoria', diff.auditoria.deleted || []);
    }

    // 15. Notificaciones
    if (diff.notificaciones) {
      await flatUpsert('notificacion', diff.notificaciones.upserted || []);
      await flatDelete('notificacion', diff.notificaciones.deleted || []);
    }

    // 16. Comisionistas
    if (diff.comisionistas) {
      await flatUpsert('comisionista', diff.comisionistas.upserted || []);
      await flatDelete('comisionista', diff.comisionistas.deleted || []);
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
        };

        await tx.cuentasCobro.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
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
        const data = {
          tipo: item.tipo,
          tema: item.tema,
          descripcion: item.descripcion,
          fecha: item.fecha,
          hora: item.hora,
          obligatoria: item.obligatoria,
          creador: item.creador,
          videoLink: item.videoLink,
          materiales: item.materiales ? JSON.stringify(item.materiales) : null,
          asistentes: item.asistentes ? JSON.stringify(item.asistentes) : null,
          evaluacion: item.evaluacion ? JSON.stringify(item.evaluacion) : null,
          estado: item.estado,
          lockedBy: item.lockedBy
        };

        await tx.capacitacion.upsert({
          where: { id: item.id },
          update: data,
          create: { id: item.id, ...data },
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