const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeUser,
  sanitizeOtherUser,
  roleHasModule,
  canWriteCollection
} = require('../src/security/permissions');

test('sanitizeUser elimina contraseña y refreshToken', () => {
  const raw = {
    id: 'u1',
    user: 'admin',
    pass: '$2a$10$xyz',
    refreshToken: 'secret_token',
    nombre: 'Administrador'
  };
  const safe = sanitizeUser(raw);
  assert.equal(safe.id, 'u1');
  assert.equal(safe.pass, undefined);
  assert.equal(safe.refreshToken, undefined);
  assert.equal(safe.nombre, 'Administrador');
});

test('sanitizeOtherUser elimina datos sensibles para terceros', () => {
  const raw = {
    id: 'u2',
    user: 'tecnico1',
    pass: '$2a$10$xyz',
    cedula: '12345678',
    firma: 'data:image/png;base64,AAA',
    failedLoginAttempts: 2,
    isLocked: false,
    nombre: 'Juan',
    cargo: 'Técnico'
  };
  const safe = sanitizeOtherUser(raw);
  assert.equal(safe.id, 'u2');
  assert.equal(safe.pass, undefined);
  assert.equal(safe.cedula, undefined);
  assert.equal(safe.firma, undefined);
  assert.equal(safe.failedLoginAttempts, undefined);
  assert.equal(safe.cargo, 'Técnico');
});

test('roleHasModule valida permisos JSON y superadmin', () => {
  const superRole = { permissions: { fullAccess: true } };
  assert.equal(roleHasModule(superRole, 'clientes'), true);

  const regularRole = { permissions: { clientes: true, inventario: false } };
  assert.equal(roleHasModule(regularRole, 'clientes'), true);
  assert.equal(roleHasModule(regularRole, 'inventario'), false);
  assert.equal(roleHasModule(regularRole, 'auditoria'), false);
});
