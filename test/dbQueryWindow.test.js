const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDbWindowQuery, buildTransactionalWhere } = require('../src/utils/dbQueryWindow');

const FIXED_NOW = new Date('2026-11-11T15:30:00.000Z');

test('parseDbWindowQuery aplica valores por defecto (12 meses y limit 500)', () => {
  const cfg = parseDbWindowQuery({}, FIXED_NOW);
  assert.equal(cfg.all, false);
  assert.equal(cfg.months, 12);
  assert.equal(cfg.limit, 500);
  assert.ok(cfg.cutoffDate instanceof Date);
  assert.equal(cfg.cutoffIso, '2025-11-11T15:30:00.000Z');
});

test('parseDbWindowQuery soporta ?months=6 y acota meses fuera de rango', () => {
  const sixMonths = parseDbWindowQuery({ months: '6' }, FIXED_NOW);
  assert.equal(sixMonths.all, false);
  assert.equal(sixMonths.months, 6);
  assert.equal(sixMonths.cutoffIso, '2026-05-11T15:30:00.000Z');

  const minMonths = parseDbWindowQuery({ months: '0' }, FIXED_NOW);
  assert.equal(minMonths.months, 1);

  const maxMonths = parseDbWindowQuery({ months: '240' }, FIXED_NOW);
  assert.equal(maxMonths.months, 60);
});

test('parseDbWindowQuery acota ?limit entre 50 y 2000 en modo ventana', () => {
  const clampedHigh = parseDbWindowQuery({ limit: '99999' }, FIXED_NOW);
  assert.equal(clampedHigh.limit, 2000);

  const clampedLow = parseDbWindowQuery({ limit: '5' }, FIXED_NOW);
  assert.equal(clampedLow.limit, 50);
});

test('parseDbWindowQuery soporta ?from=YYYY-MM-DD válido', () => {
  const fromCfg = parseDbWindowQuery({ from: '2026-01-15' }, FIXED_NOW);
  assert.equal(fromCfg.all, false);
  assert.equal(fromCfg.months, null);
  assert.equal(fromCfg.cutoffIso, '2026-01-15T00:00:00.000Z');
});

test('parseDbWindowQuery soporta ?all=true y ?all=1 en modo histórico completo', () => {
  const allTrue = parseDbWindowQuery({ all: 'true' }, FIXED_NOW);
  assert.equal(allTrue.all, true);
  assert.equal(allTrue.months, null);
  assert.equal(allTrue.cutoffDate, null);
  assert.equal(allTrue.cutoffIso, null);
  assert.equal(allTrue.limit, 5000);

  const allOneClamped = parseDbWindowQuery({ all: '1', limit: '99999' }, FIXED_NOW);
  assert.equal(allOneClamped.all, true);
  assert.equal(allOneClamped.limit, 5000);
});

test('buildTransactionalWhere retorna undefined en modo all=true y filtra por fecha sin closedStates', () => {
  const allCfg = parseDbWindowQuery({ all: 'true' }, FIXED_NOW);
  assert.equal(buildTransactionalWhere(allCfg, { dateField: 'fecha' }), undefined);

  const winCfg = parseDbWindowQuery({ months: '6' }, FIXED_NOW);
  const simpleWhere = buildTransactionalWhere(winCfg, { dateField: 'fecha' });
  assert.deepEqual(simpleWhere, {
    fecha: { gte: winCfg.cutoffDate }
  });
});

test('buildTransactionalWhere preserva casos abiertos antiguos cuando recibe closedStates', () => {
  const winCfg = parseDbWindowQuery({ months: '12' }, FIXED_NOW);
  const closedStates = ['Cerrado', 'Cerrada', 'Resuelto', 'Resuelta', 'Finalizado'];

  const pqrWhere = buildTransactionalWhere(winCfg, {
    dateField: 'fecha',
    closedStates
  });
  assert.deepEqual(pqrWhere, {
    OR: [
      { fecha: { gte: winCfg.cutoffDate } },
      { estado: { notIn: closedStates } }
    ]
  });

  const servicioWhere = buildTransactionalWhere(winCfg, {
    dateField: 'fechaProg',
    closedStates: ['Finalizado', 'Cerrado']
  });
  assert.deepEqual(servicioWhere, {
    OR: [
      { fechaProg: { gte: winCfg.cutoffDate } },
      { estado: { notIn: ['Finalizado', 'Cerrado'] } }
    ]
  });

  const procWhere = buildTransactionalWhere(winCfg, {
    dateField: 'fecha',
    stateField: 'etapa',
    closedStates: [4]
  });
  assert.deepEqual(procWhere, {
    OR: [
      { fecha: { gte: winCfg.cutoffDate } },
      { etapa: { notIn: [4] } }
    ]
  });
});
