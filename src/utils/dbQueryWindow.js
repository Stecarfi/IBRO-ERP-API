/**
 * Utilidad pura para controlar la ventana temporal y límites de registros
 * transaccionales en GET /api/db sin perder casos abiertos antiguos.
 */

const DEFAULT_MONTHS = 12;
const MIN_MONTHS = 1;
const MAX_MONTHS = 60;

const DEFAULT_LIMIT = 500;
const MIN_LIMIT = 50;
const MAX_WINDOW_LIMIT = 2000;
const MAX_ALL_LIMIT = 5000;

function clampInt(value, min, max, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseValidFromDate(rawFrom) {
  if (rawFrom === undefined || rawFrom === null) return null;
  if (rawFrom instanceof Date) {
    return Number.isNaN(rawFrom.getTime()) ? null : new Date(rawFrom.getTime());
  }
  const str = String(rawFrom).trim();
  if (!str) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(str)) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00.000Z` : str;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function subtractUtcMonths(baseDate, months) {
  const nowDate = baseDate instanceof Date && !Number.isNaN(baseDate.getTime())
    ? new Date(baseDate.getTime())
    : new Date();
  const totalMonths = nowDate.getUTCFullYear() * 12 + nowDate.getUTCMonth() - months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(nowDate.getUTCDate(), maxDay);

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    clampedDay,
    nowDate.getUTCHours(),
    nowDate.getUTCMinutes(),
    nowDate.getUTCSeconds(),
    nowDate.getUTCMilliseconds()
  ));
}

/**
 * Parsea req.query para GET /api/db y devuelve la ventana temporal normalizada.
 * @param {Record<string, any>} query
 * @param {Date} now
 */
function parseDbWindowQuery(query = {}, now = new Date()) {
  const safeQuery = query && typeof query === 'object' ? query : {};
  const allFlag = safeQuery.all === true
    || safeQuery.all === 1
    || String(safeQuery.all || '').trim().toLowerCase() === 'true'
    || String(safeQuery.all || '').trim() === '1';

  if (allFlag) {
    const limit = clampInt(safeQuery.limit, MIN_LIMIT, MAX_ALL_LIMIT, MAX_ALL_LIMIT);
    return {
      all: true,
      months: null,
      cutoffDate: null,
      cutoffIso: null,
      limit
    };
  }

  const limit = clampInt(safeQuery.limit, MIN_LIMIT, MAX_WINDOW_LIMIT, DEFAULT_LIMIT);
  const fromDate = parseValidFromDate(safeQuery.from);
  const hasMonthsParam = safeQuery.months !== undefined
    && safeQuery.months !== null
    && String(safeQuery.months).trim() !== '';

  let months = null;
  if (hasMonthsParam) {
    months = clampInt(safeQuery.months, MIN_MONTHS, MAX_MONTHS, DEFAULT_MONTHS);
  } else if (!fromDate) {
    months = DEFAULT_MONTHS;
  }

  const cutoffDate = fromDate || subtractUtcMonths(now, months || DEFAULT_MONTHS);

  return {
    all: false,
    months,
    cutoffDate,
    cutoffIso: cutoffDate ? cutoffDate.toISOString() : null,
    limit
  };
}

/**
 * Construye el filtro Prisma `where` para colecciones transaccionales:
 * - Si `all` es true o no hay `cutoffDate`, retorna `undefined`.
 * - Si se provee `closedStates`, rescata también cualquier registro cuyo estado
 *   NO esté dentro de los estados cerrados aunque sea anterior a `cutoffDate`.
 * - Si no se provee `closedStates`, filtra por `[dateField] >= cutoffDate`.
 */
function buildTransactionalWhere(
  windowCfg,
  { dateField = 'fecha', closedStates = null, keepOpenStates = null, stateField = 'estado', nullableState = false } = {}
) {
  if (!windowCfg || windowCfg.all || !windowCfg.cutoffDate) {
    return undefined;
  }

  if (Array.isArray(closedStates) && closedStates.length > 0) {
    const orClauses = [
      { [dateField]: { gte: windowCfg.cutoffDate } },
      { [stateField]: { notIn: closedStates } }
    ];
    if (nullableState) {
      orClauses.push({ [stateField]: null });
    }
    return { OR: orClauses };
  }

  if (Array.isArray(keepOpenStates) && keepOpenStates.length > 0) {
    return {
      OR: [
        { [dateField]: { gte: windowCfg.cutoffDate } },
        { [stateField]: { in: keepOpenStates } }
      ]
    };
  }

  return {
    [dateField]: { gte: windowCfg.cutoffDate }
  };
}

module.exports = {
  parseDbWindowQuery,
  buildTransactionalWhere
};
