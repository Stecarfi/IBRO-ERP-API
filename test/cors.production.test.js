process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-ibro-erp-2026-secure';

const { describe, test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const { parseAllowedOrigins, createOriginChecker } = require('../src/config/cors');
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

describe('CORS en producción (https://g-ibro.onrender.com -> /api/campo/movimientos/dia)', () => {
  test('parseAllowedOrigins siempre preserva https://g-ibro.onrender.com incluso si ALLOWED_ORIGINS define otros dominios', () => {
    const list = parseAllowedOrigins('https://otro-dominio.ejemplo.com', 'https://panel.ejemplo.com');
    assert.ok(list.includes('https://g-ibro.onrender.com'));
    assert.ok(list.includes('https://ibro-api.onrender.com'));
    assert.ok(list.includes('https://otro-dominio.ejemplo.com'));
    assert.ok(list.includes('https://panel.ejemplo.com'));

    const checker = createOriginChecker({ allowedOrigins: list, isProduction: true });
    assert.equal(checker.isAllowed('https://g-ibro.onrender.com'), true);
    assert.equal(checker.isAllowed('https://sitio-malicioso.evil'), false);
  });

  test('OPTIONS preflight con cabeceras personalizadas (x-modulo, x-user-id, authorization) devuelve 204 y Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${baseUrl}/api/campo/movimientos/dia?periodo=todos&modulo=control_gerencial&usuarioId=TODOS`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://g-ibro.onrender.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type,x-modulo,x-user,x-user-id'
      }
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://g-ibro.onrender.com');
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(res.headers.get('access-control-max-age'), '86400');
    const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(allowHeaders.includes('x-modulo'));
    assert.ok(allowHeaders.includes('authorization'));
  });

  test('GET no autenticado (401) mantiene Access-Control-Allow-Origin para https://g-ibro.onrender.com y bloquea orígenes no autorizados', async () => {
    const allowedRes = await fetch(`${baseUrl}/api/campo/movimientos/dia?periodo=todos&modulo=control_gerencial&usuarioId=TODOS`, {
      headers: { Origin: 'https://g-ibro.onrender.com' }
    });
    assert.equal(allowedRes.status, 401);
    assert.equal(allowedRes.headers.get('access-control-allow-origin'), 'https://g-ibro.onrender.com');

    const deniedRes = await fetch(`${baseUrl}/api/campo/movimientos/dia?periodo=todos&modulo=control_gerencial&usuarioId=TODOS`, {
      headers: { Origin: 'https://atacante-externo.evil' }
    });
    assert.equal(deniedRes.status, 401);
    assert.equal(deniedRes.headers.get('access-control-allow-origin'), null);
  });

  test('GET autenticado (200) y errores internos (500) en /api/campo/movimientos/dia siempre devuelven Access-Control-Allow-Origin', async () => {
    const token = jwt.sign(
      { id: 'admin-1', user: 'admin', roleId: '1', esDelegadoGerencia: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    stubMethod(prisma.user, 'findUnique', async () => ({
      id: 'admin-1',
      user: 'admin',
      nombre: 'Stephanie',
      apellido: 'Carrasquilla',
      esDelegadoGerencia: true,
      esComercialCampo: false,
      cargo: 'Gerencia',
      roleId: '1',
      role: { id: '1', name: 'Administrador' }
    }));
    stubMethod(prisma.jornadaLaboral, 'updateMany', async () => ({ count: 0 }));
    stubMethod(prisma.auditoriaSesion, 'findMany', async () => []);
    stubMethod(prisma.user, 'findMany', async () => []);
    stubMethod(prisma.visitaCampo, 'findMany', async () => []);
    stubMethod(prisma.jornadaLaboral, 'findMany', async () => []);
    stubMethod(prisma.rastreoUbicacion, 'findMany', async () => []);
    stubMethod(prisma.actividadCampo, 'findMany', async () => []);
    stubMethod(prisma.pausaJornada, 'findMany', async () => []);
    stubMethod(prisma.ventaExternaCampo, 'findMany', async () => []);
    stubMethod(prisma.clienteExternoCampo, 'findMany', async () => []);

    const okRes = await fetch(`${baseUrl}/api/campo/movimientos/dia?periodo=todos&modulo=control_gerencial&usuarioId=TODOS`, {
      headers: {
        Origin: 'https://g-ibro.onrender.com',
        Authorization: `Bearer ${token}`,
        'x-modulo': 'control_gerencial'
      }
    });

    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get('access-control-allow-origin'), 'https://g-ibro.onrender.com');
    const body = await okRes.json();
    assert.equal(body.success, true);

    // Simular fallo de base de datos (500) y verificar que CORS tampoco desaparece
    stubMethod(prisma.user, 'findMany', async () => {
      throw new Error('Simulated DB pool error');
    });

    const errRes = await fetch(`${baseUrl}/api/campo/movimientos/dia?periodo=todos&modulo=control_gerencial&usuarioId=TODOS`, {
      headers: {
        Origin: 'https://g-ibro.onrender.com',
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(errRes.status, 500);
    assert.equal(errRes.headers.get('access-control-allow-origin'), 'https://g-ibro.onrender.com');
  });
});
