const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const authenticateToken = require('../middlewares/auth.middleware');
const { getAccessContext } = require('../middlewares/rbac.middleware');
const { canWriteCollection } = require('../security/permissions');
const { sanitizeBackendForPrisma } = require('../validators');

router.use(authenticateToken);

/**
 * GET /api/clientes
 * Lista clientes con búsqueda opcional y paginación real en servidor.
 */
router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { nom: { contains: search, mode: 'insensitive' } },
            { doc: { contains: search, mode: 'insensitive' } },
            { correo: { contains: search, mode: 'insensitive' } },
            { tel: { contains: search, mode: 'insensitive' } },
            { ciudad: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {};

    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit
      }),
      prisma.cliente.count({ where })
    ]);

    return res.json({
      success: true,
      clientes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[GET /api/clientes Error]:', err);
    return res.status(500).json({ error: err.message || 'Error consultando clientes' });
  }
});

/**
 * POST /api/clientes y PUT /api/clientes/:id
 * Guarda o actualiza un cliente individual (evita enviar toda la BD por /api/db/sync)
 * y emite el diff incremental por Socket.IO para mantener sincronizados a los demás usuarios.
 */
const handleUpsertCliente = async (req, res) => {
  try {
    const accessCtx = await getAccessContext(req.user);
    const check = canWriteCollection(accessCtx, 'clientes', 'upsert');
    if (!check.allowed) {
      return res.status(403).json({ error: `Acceso denegado para modificar clientes: ${check.reason || 'sin permisos'}.` });
    }

    const rawItem = { ...(req.body || {}) };
    if (req.params.id && !rawItem.id) {
      rawItem.id = String(req.params.id);
    }

    const cleaned = sanitizeBackendForPrisma('cliente', rawItem);
    if (!cleaned.nom || !String(cleaned.nom).trim()) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
    }
    if (!cleaned.id) {
      cleaned.id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    let saved = null;
    if (cleaned.doc) {
      const existingByDoc = await prisma.cliente.findUnique({ where: { doc: cleaned.doc } });
      if (existingByDoc && existingByDoc.id !== cleaned.id) {
        const { id: _ignoredId, ...updateData } = cleaned;
        saved = await prisma.cliente.update({
          where: { id: existingByDoc.id },
          data: updateData
        });
      }
    }

    if (!saved) {
      const { id: idToUpsert, ...dataToUpsert } = cleaned;
      saved = await prisma.cliente.upsert({
        where: { id: idToUpsert },
        update: dataToUpsert,
        create: cleaned
      });
    }

    const io = req.app?.get ? req.app.get('io') : null;
    if (io) {
      io.emit('db_update', {
        type: 'DB_UPDATE',
        diff: { clientes: { upserted: [saved], deleted: [] } },
        timestamp: Date.now()
      });
    }

    return res.json({ success: true, cliente: saved });
  } catch (err) {
    console.error('[Upsert /api/clientes Error]:', err);
    return res.status(500).json({ error: err.message || 'Error guardando cliente' });
  }
};

router.post('/', handleUpsertCliente);
router.put('/:id', handleUpsertCliente);

/**
 * DELETE /api/clientes/:id
 * Elimina un cliente individual desvinculando relaciones de campo y emite diff incremental.
 */
router.delete('/:id', async (req, res) => {
  try {
    const accessCtx = await getAccessContext(req.user);
    const check = canWriteCollection(accessCtx, 'clientes', 'delete');
    if (!check.allowed) {
      return res.status(403).json({ error: `Acceso denegado para eliminar clientes: ${check.reason || 'sin permisos'}.` });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID de cliente requerido.' });

    await prisma.$transaction(async (tx) => {
      await tx.visitaCampo.updateMany({ where: { clienteId: id }, data: { clienteId: null } });
      await tx.seguimientoCampo.updateMany({ where: { clienteId: id }, data: { clienteId: null } });
      await tx.cliente.deleteMany({ where: { id } });
    });

    const io = req.app?.get ? req.app.get('io') : null;
    if (io) {
      io.emit('db_update', {
        type: 'DB_UPDATE',
        diff: { clientes: { upserted: [], deleted: [id] } },
        timestamp: Date.now()
      });
    }

    return res.json({ success: true, id });
  } catch (err) {
    console.error('[DELETE /api/clientes/:id Error]:', err);
    return res.status(500).json({ error: err.message || 'Error eliminando cliente' });
  }
});

module.exports = router;
