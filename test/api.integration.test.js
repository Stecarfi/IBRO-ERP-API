process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-ibro-erp-2026-secure';

const { describe, test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { app, server: mainServer, prisma } = require('../src/index');

let testServer;
let baseUrl;
const activeRestorers = [];

function stubMethod(target, prop, impl) {
  const original = target[prop];
  target[prop] = impl;
  activeRestorers.push(() => {
    target[prop] = original;
  });
}

async function requestJson(pathname, { method = 'GET', headers = {}, body } = {}) {
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const reqHeaders = {
    Accept: 'application/json',
    ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  };

  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: reqHeaders,
    body: payload
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, headers: res.headers, body: json };
}

before(async () => {
  testServer = http.createServer(app);
  await new Promise((resolve) => {
    testServer.listen(0, '127.0.0.1', resolve);
  });
  const addr = testServer.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(() => {
  while (activeRestorers.length > 0) {
    const restore = activeRestorers.pop();
    restore();
  }
});

after(async () => {
  const ioInstance = app.get('io');
  if (ioInstance && typeof ioInstance.close === 'function') {
    await new Promise((resolve) => ioInstance.close(() => resolve()));
  }
  if (mainServer && mainServer.listening) {
    if (typeof mainServer.closeAllConnections === 'function') mainServer.closeAllConnections();
    await new Promise((resolve) => mainServer.close(() => resolve()));
  }
  if (testServer) {
    if (typeof testServer.closeAllConnections === 'function') testServer.closeAllConnections();
    await new Promise((resolve) => testServer.close(() => resolve()));
  }
});

describe('POST /api/login', () => {
  test('devuelve 400 cuando el payload es vacío o inválido (Zod)', async () => {
    const res = await requestJson('/api/login', {
      method: 'POST',
      body: {}
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('devuelve 401 con credenciales incorrectas', async () => {
    stubMethod(prisma.user, 'findFirst', async () => null);

    const res = await requestJson('/api/login', {
      method: 'POST',
      body: { user: 'usuario_inexistente', pass: 'clave123' }
    });
    assert.equal(res.status, 401);
  });

  test('devuelve 403 cuando la cuenta tiene isLocked: true', async () => {
    stubMethod(prisma.user, 'findFirst', async () => ({
      id: 'u-locked',
      user: 'bloqueado',
      nombre: 'Usuario',
      apellido: 'Bloqueado',
      pass: bcrypt.hashSync('CorrectPass123!', 10),
      roleId: '2',
      isLocked: true,
      failedLoginAttempts: 3
    }));

    const res = await requestJson('/api/login', {
      method: 'POST',
      body: { user: 'bloqueado', pass: 'CorrectPass123!' }
    });
    assert.equal(res.status, 403);
  });

  test('devuelve 200 con token, refreshToken, lastLogin en ISO UTC (Z) y sin secretos', async () => {
    const hashedPass = bcrypt.hashSync('MiClaveSegura2026!', 10);
    const mockDbUser = {
      id: 'u-asesor-1',
      user: 'asesor1',
      nombre: 'Carlos',
      apellido: 'Pérez',
      cedula: '1050000111',
      correo: 'carlos@ibrosas.com',
      cargo: 'Asesor Comercial',
      pass: hashedPass,
      roleId: '2',
      isLocked: false,
      failedLoginAttempts: 0,
      refreshToken: '["old-token"]',
      esComercialCampo: false,
      esDelegadoGerencia: false
    };

    stubMethod(prisma.user, 'findFirst', async () => ({ ...mockDbUser }));
    stubMethod(prisma.user, 'findUnique', async () => ({ ...mockDbUser }));
    stubMethod(prisma.user, 'update', async ({ data }) => ({ ...mockDbUser, ...data }));
    stubMethod(prisma.auditoria, 'create', async ({ data }) => ({ id: 'aud-1', ...data }));
    stubMethod(prisma.auditoriaSesion, 'findFirst', async () => null);
    stubMethod(prisma.auditoriaSesion, 'create', async ({ data }) => ({ id: 'ses-1', ...data }));
    stubMethod(prisma.auditoriaSesion, 'update', async ({ data }) => ({ id: 'ses-1', ...data }));

    const res = await requestJson('/api/login', {
      method: 'POST',
      body: { user: 'asesor1', pass: 'MiClaveSegura2026!' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.token, 'string');
    assert.equal(typeof res.body.refreshToken, 'string');
    assert.equal(res.body.user.pass, undefined);
    assert.equal(res.body.user.refreshToken, undefined);
    assert.match(res.body.user.lastLogin, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('GET /api/db', () => {
  function stubFullDbMocks(capturedCalls = {}) {
    const recordFindMany = (name, rows = []) => async (args) => {
      capturedCalls[name] = args;
      return rows;
    };

    stubMethod(prisma.user, 'findMany', recordFindMany('user', [
      { id: 'u-2', user: 'asesor1', nombre: 'Carlos', apellido: 'Pérez', roleId: '2', cargo: 'Asesor' }
    ]));
    stubMethod(prisma.role, 'findMany', recordFindMany('role', [
      { id: '1', name: 'Administrador', modules: ['admin'], permissions: { fullAccess: true } }
    ]));
    stubMethod(prisma.cliente, 'findMany', recordFindMany('cliente', []));
    stubMethod(prisma.inventario, 'findMany', recordFindMany('inventario', []));
    stubMethod(prisma.venta, 'findMany', recordFindMany('venta', []));
    stubMethod(prisma.cotizacion, 'findMany', recordFindMany('cotizacion', [
      {
        id: 'cot-1',
        numCotizacion: 'COT-001',
        fecha: new Date('2026-10-10T14:00:00.000Z'),
        vendedorId: 'u-2',
        clienteId: 'cli-1',
        items: [],
        total: 1500000,
        fechaSeguimiento: new Date('2026-10-15T15:00:00.000Z')
      }
    ]));
    stubMethod(prisma.pQR, 'findMany', recordFindMany('pQR', []));
    stubMethod(prisma.servicio, 'findMany', recordFindMany('servicio', []));
    stubMethod(prisma.solicitud, 'findMany', recordFindMany('solicitud', []));
    stubMethod(prisma.procesoDisciplinario, 'findMany', recordFindMany('procesoDisciplinario', []));
    stubMethod(prisma.evaluacion, 'findMany', recordFindMany('evaluacion', []));
    stubMethod(prisma.cuentasCobro, 'findMany', recordFindMany('cuentasCobro', []));
    stubMethod(prisma.anuncio, 'findMany', recordFindMany('anuncio', []));
    stubMethod(prisma.chatGroup, 'findMany', recordFindMany('chatGroup', []));
    stubMethod(prisma.chat, 'findMany', recordFindMany('chat', []));
    stubMethod(prisma.auditoria, 'findMany', recordFindMany('auditoria', []));
    stubMethod(prisma.notificacion, 'findMany', recordFindMany('notificacion', []));
    stubMethod(prisma.comisionista, 'findMany', recordFindMany('comisionista', []));
    stubMethod(prisma.whatsappConfig, 'findFirst', async () => null);
    stubMethod(prisma.informesConfig, 'findUnique', async () => null);
    stubMethod(prisma.capacitacion, 'findMany', recordFindMany('capacitacion', []));
    stubMethod(prisma.cotizacionExternaCampo, 'findMany', recordFindMany('cotizacionExternaCampo', []));
    stubMethod(prisma.ventaExternaCampo, 'findMany', recordFindMany('ventaExternaCampo', []));
    stubMethod(prisma.clienteExternoCampo, 'findMany', recordFindMany('clienteExternoCampo', []));
  }

  test('devuelve 401 sin token de autenticación', async () => {
    const res = await requestJson('/api/db');
    assert.equal(res.status, 401);
  });

  test('devuelve 200 con Bearer JWT válido, colecciones completas y _windowMeta para ?months=6 y ?all=true', async () => {
    const capturedCalls = {};
    stubFullDbMocks(capturedCalls);

    const validToken = jwt.sign(
      { id: 'u-2', user: 'asesor1', roleId: '1', cargo: 'Admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resMonths = await requestJson('/api/db?months=6', {
      headers: { Authorization: `Bearer ${validToken}` }
    });

    assert.equal(resMonths.status, 200);
    const expectedCollections = [
      'users', 'roles', 'clientes', 'inventario', 'ventas', 'pqrs',
      'servicios', 'solicitudes', 'procesosDisciplinarios', 'evaluaciones',
      'anuncios', 'cotizaciones', 'chatGroups', 'chat', 'auditoria',
      'notificaciones', 'comisionistas', 'cuentasCobro', 'capacitaciones',
      'config', 'informesConfig', 'whatsappConfig',
      'cotizaciones_externas', 'pedidos_externos', 'clientes_externos'
    ];
    for (const key of expectedCollections) {
      assert.ok(Object.prototype.hasOwnProperty.call(resMonths.body, key), `Falta colección '${key}' en /api/db`);
    }
    assert.equal(resMonths.body._windowMeta.all, false);
    assert.equal(resMonths.body._windowMeta.months, 6);
    assert.equal(resMonths.body._windowMeta.limit, 500);
    assert.equal(typeof resMonths.body._windowMeta.cutoffIso, 'string');
    assert.equal(resMonths.body.cotizaciones[0].seguimiento.fechaSeguimiento, '15/10/2026');
    assert.ok(capturedCalls.pQR.where && Array.isArray(capturedCalls.pQR.where.OR));

    const resAll = await requestJson('/api/db?all=true', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    assert.equal(resAll.status, 200);
    assert.deepEqual(resAll.body._windowMeta, {
      all: true,
      months: null,
      cutoffIso: null,
      limit: 5000
    });
    assert.equal(capturedCalls.venta.where, undefined);
  });
});

describe('POST /api/db/sync', () => {
  test('devuelve 401 sin token de autenticación', async () => {
    const res = await requestJson('/api/db/sync', {
      method: 'POST',
      body: { diff: { clientes: { upserted: [] } } }
    });
    assert.equal(res.status, 401);
  });

  test('devuelve 403 cuando un usuario sin permisos intenta modificar roles o clientes', async () => {
    stubMethod(prisma.role, 'findUnique', async ({ where }) => {
      if (where.id === 'role-solicitudes-only') {
        return {
          id: 'role-solicitudes-only',
          name: 'Solo Solicitudes',
          modules: ['solicitudes'],
          permissions: { solicitudes: ['view', 'edit'] }
        };
      }
      return null;
    });

    const restrictedToken = jwt.sign(
      {
        id: 'u-limitado-1',
        user: 'auxiliar1',
        roleId: 'role-solicitudes-only',
        cargo: 'Auxiliar',
        esComercialCampo: false,
        esDelegadoGerencia: false
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resRoles = await requestJson('/api/db/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${restrictedToken}` },
      body: {
        diff: {
          roles: {
            upserted: [{ id: 'role-hack', name: 'SuperAdmin', modules: ['admin'] }]
          }
        }
      }
    });
    assert.equal(resRoles.status, 403);

    const resClientes = await requestJson('/api/db/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${restrictedToken}` },
      body: {
        diff: {
          clientes: {
            upserted: [{ id: 'cli-unauth-1', doc: '900123456', nom: 'Empresa No Autorizada' }]
          }
        }
      }
    });
    assert.equal(resClientes.status, 403);
  });
});
