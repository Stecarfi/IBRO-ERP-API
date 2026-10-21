const prisma = require('../prisma');

/**
 * RBAC de servidor (Fase 0 - contención).
 * El frontend controla la visibilidad con el JSON `permissions` del rol; el backend
 * debe aplicar la MISMA regla para que no baste con saltarse la UI.
 */

const roleCache = new Map(); // roleId -> { role, ts }
const ROLE_TTL_MS = 60 * 1000;

async function loadRole(roleId) {
  if (!roleId) return null;
  const key = String(roleId);
  const hit = roleCache.get(key);
  if (hit && Date.now() - hit.ts < ROLE_TTL_MS) return hit.role;
  let role = null;
  try {
    role = await prisma.role.findUnique({ where: { id: key } });
  } catch (e) {
    role = null;
  }
  roleCache.set(key, { role, ts: Date.now() });
  return role;
}

function parsePermissions(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function roleHasModule(role, moduleName) {
  if (!role) return false;
  const perms = parsePermissions(role.permissions);
  if (perms.isSuperAdmin === true || perms.fullAccess === true) return true;
  if (Array.isArray(role.modules) && role.modules.includes(moduleName)) return true;
  const p = perms[moduleName];
  if (Array.isArray(p)) return p.length > 0;
  if (p && typeof p === 'object') return Object.values(p).some(Boolean);
  return p === true;
}

async function isAdminUser(reqUser) {
  if (!reqUser) return false;
  const roleId = String(reqUser.roleId || '');
  if (roleId === '1') return true;
  const role = await loadRole(roleId);
  return roleHasModule(role, 'admin');
}

async function userHasModule(reqUser, moduleName) {
  if (!reqUser) return false;
  if (await isAdminUser(reqUser)) return true;
  const role = await loadRole(reqUser.roleId);
  return roleHasModule(role, moduleName);
}

/** Middleware: exige que el usuario autenticado tenga acceso a alguno de los módulos. */
function requireModuleAccess(...moduleNames) {
  return async (req, res, next) => {
    try {
      for (const m of moduleNames) {
        if (await userHasModule(req.user, m)) return next();
      }
    } catch (e) {}
    return res.status(403).json({ error: 'Acceso denegado: su rol no tiene permiso para este recurso.', code: 'FORBIDDEN' });
  };
}

/** Middleware: exige rol administrador. */
async function requireAdmin(req, res, next) {
  try {
    if (await isAdminUser(req.user)) return next();
  } catch (e) {}
  return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de Administrador.', code: 'FORBIDDEN' });
}

module.exports = { isAdminUser, userHasModule, requireModuleAccess, requireAdmin, loadRole };
