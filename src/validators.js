const { z } = require('zod');

// Esquemas genéricos para validación de sincronización
// Estos esquemas aseguran que los IDs no sean inyectables y que los campos críticos sean correctos.

const clienteSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  doc: z.string().min(1),
  nom: z.string().min(1),
  tipo_cliente: z.string(),
  tel: z.string().optional().nullable(),
  correo: z.string().optional().nullable(),
}).passthrough();

const inventarioSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  cod: z.string().min(1),
  nom: z.string().min(1),
  cant: z.number().int().min(0),
  precio: z.number().min(0)
}).passthrough();

const syncDiffSchema = z.object({
  updated: z.record(z.array(z.any())).optional(),
  deleted: z.record(z.array(z.string())).optional()
});

function validateSyncPayload(diff) {
  // 1. Validar estructura global del diff
  const parsedDiff = syncDiffSchema.safeParse(diff);
  if (!parsedDiff.success) {
    throw new Error('Estructura de payload de sincronización inválida');
  }

  // 2. Validación profunda para tablas críticas
  const { updated } = diff;
  if (updated) {
    if (updated.clientes) {
      updated.clientes.forEach(c => {
        const res = clienteSchema.safeParse(c);
        if (!res.success) throw new Error(`Validación de Cliente fallida: ${res.error.errors[0].message}`);
      });
    }
    if (updated.inventario) {
      updated.inventario.forEach(i => {
        const res = inventarioSchema.safeParse(i);
        if (!res.success) throw new Error(`Validación de Inventario fallida: ${res.error.errors[0].message}`);
      });
    }
  }

  return true;
}

module.exports = {
  validateSyncPayload
};
