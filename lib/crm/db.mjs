// One query interface, two databases.
//
//   sqlite    node:sqlite, file at .data/crm.db. What runs on your machine with
//             no credentials at all. Also what runs on Vercel if Supabase is not
//             configured, where it is ephemeral and therefore useless, so the
//             API says so rather than pretending to save.
//   supabase  Postgres through PostgREST, using the service role key server side.
//             This is the live database.
//
// Deliberately small. Every clever query the CRM needs is composed in JS from
// these primitives, so neither driver has to grow its own SQL and drift.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, FLAG_COLUMNS, sqliteDDL } from './schema.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const SUPABASE_URL = () => process.env.SUPABASE_URL || '';
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const driver = () => (SUPABASE_URL() && SUPABASE_KEY() ? 'supabase' : 'sqlite');

/** True when writes will actually survive. Vercel's filesystem will not. */
export const durable = () => driver() === 'supabase' || !process.env.VERCEL;

export const newId = () => globalThis.crypto.randomUUID();
export const nowISO = () => new Date().toISOString();

/* ------------------------------------------------------------------ shaping */

const COLUMNS = Object.fromEntries(
  Object.entries(TABLES).map(([t, d]) => [t, Object.keys(d.columns)])
);
const TYPES = Object.fromEntries(
  Object.entries(TABLES).map(([t, d]) => [t, d.columns])
);

/** Drops unknown keys and coerces to the column's type. Callers can pass junk. */
export function shape(table, row) {
  const types = TYPES[table];
  if (!types) throw new Error(`Unknown table: ${table}`);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (!(k in types)) continue;
    if (v === undefined) continue;
    if (v === null) { out[k] = null; continue; }
    if (FLAG_COLUMNS.has(k)) { out[k] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; continue; }
    if (types[k] === 'i') {
      const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9.-]/g, ''), 10);
      out[k] = Number.isFinite(n) ? Math.round(n) : null;
      continue;
    }
    if (types[k] === 'r') {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ''));
      out[k] = Number.isFinite(n) ? n : null;
      continue;
    }
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

/* ------------------------------------------------------------- sqlite driver */

let handle = null;

function sqlite() {
  if (handle) return handle;
  const dir = join(ROOT, '.data');
  try { mkdirSync(dir, { recursive: true }); } catch { /* read-only fs: memory it is */ }
  let file = join(dir, 'crm.db');
  try {
    handle = new DatabaseSync(file);
  } catch {
    handle = new DatabaseSync(':memory:');
  }
  handle.exec('PRAGMA journal_mode = WAL;');
  handle.exec(sqliteDDL());
  return handle;
}

const q = s => `"${String(s).replace(/"/g, '')}"`;

/** Renders one clause into `sql` + pushes its parameters. */
function sqClause(c, params) {
  if (c.or) return '(' + c.or.map(x => sqClause(x, params)).join(' OR ') + ')';
  const col = q(c.col);
  switch (c.op) {
    case 'isnull': return `(${col} IS NULL OR ${col} = '')`;
    case 'notnull': return `(${col} IS NOT NULL AND ${col} <> '')`;
    case 'in': {
      const vals = c.val || [];
      if (!vals.length) return '1 = 0';
      params.push(...vals);
      return `${col} IN (${vals.map(() => '?').join(',')})`;
    }
    case 'nin': {
      const vals = c.val || [];
      if (!vals.length) return '1 = 1';
      params.push(...vals);
      return `${col} NOT IN (${vals.map(() => '?').join(',')})`;
    }
    case 'like': params.push(`%${c.val}%`); return `${col} LIKE ? ESCAPE '\\'`;
    case 'neq': params.push(c.val); return `${col} IS NOT ?`;
    case 'gt': params.push(c.val); return `${col} > ?`;
    case 'gte': params.push(c.val); return `${col} >= ?`;
    case 'lt': params.push(c.val); return `${col} < ?`;
    case 'lte': params.push(c.val); return `${col} <= ?`;
    default: params.push(c.val); return `${col} = ?`;
  }
}

function sqWhere(opts, params) {
  const bits = (opts.where || []).map(c => sqClause(c, params));
  if (opts.search && opts.search.term) {
    const term = `%${opts.search.term.toLowerCase()}%`;
    const or = opts.search.cols.map(c => {
      params.push(term);
      return `LOWER(COALESCE(${q(c)}, '')) LIKE ?`;
    });
    if (or.length) bits.push('(' + or.join(' OR ') + ')');
  }
  return bits.length ? ' WHERE ' + bits.join(' AND ') : '';
}

const plainRows = rows => rows.map(r => ({ ...r }));

const sqliteDriver = {
  async select(table, opts = {}) {
    const db = sqlite();
    const params = [];
    const cols = opts.columns ? opts.columns.map(q).join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${q(table)}` + sqWhere(opts, params);
    if (opts.order && opts.order.length) {
      sql += ' ORDER BY ' + opts.order
        .map(o => `${q(o.col)} ${String(o.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}${o.nullsLast ? '' : ''}`)
        .join(', ');
    }
    if (opts.limit) sql += ` LIMIT ${Number(opts.limit)}`;
    if (opts.offset) sql += ` OFFSET ${Number(opts.offset)}`;
    return plainRows(db.prepare(sql).all(...params));
  },

  async count(table, opts = {}) {
    const db = sqlite();
    const params = [];
    const sql = `SELECT COUNT(*) AS n FROM ${q(table)}` + sqWhere(opts, params);
    return db.prepare(sql).get(...params).n;
  },

  async insertMany(table, rows) {
    const db = sqlite();
    if (!rows.length) return [];
    const cols = COLUMNS[table];
    const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    const stmt = db.prepare(sql);
    db.exec('BEGIN');
    try {
      for (const r of rows) stmt.run(...cols.map(c => (r[c] === undefined ? null : r[c])));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return rows;
  },

  async update(table, where, patch) {
    const db = sqlite();
    const keys = Object.keys(patch);
    if (!keys.length) return 0;
    const params = keys.map(k => patch[k]);
    const sql = `UPDATE ${q(table)} SET ${keys.map(k => `${q(k)} = ?`).join(', ')}` +
      sqWhere({ where }, params);
    return db.prepare(sql).run(...params).changes;
  },

  async remove(table, where) {
    const db = sqlite();
    const params = [];
    const sql = `DELETE FROM ${q(table)}` + sqWhere({ where }, params);
    return db.prepare(sql).run(...params).changes;
  },
};

/* ----------------------------------------------------------- supabase driver */

const sbHeaders = extra => ({
  apikey: SUPABASE_KEY(),
  Authorization: `Bearer ${SUPABASE_KEY()}`,
  ...extra,
});

const sbUrl = table => `${SUPABASE_URL()}/rest/v1/${table}`;

/**
 * PostgREST values are NOT quoted for normal operators.
 *
 * This was a real bug: quoting anything containing a dot meant
 * `email=eq."earl@s4digi.com"` compared against a string that still had the
 * quote marks in it, matched nothing, and every login failed. Verified against
 * a live database: `eq` and `ilike` return zero rows when quoted, and cope
 * perfectly well unquoted with dots, spaces, colons and @ signs.
 *
 * Quoting is only needed where a comma or a bracket would otherwise be read as
 * syntax: inside `in.(a,b)` and inside an `or=(...)` group.
 */
const pgVal = v => (v === null || v === undefined ? 'null' : String(v));

/** Inside a list or a group, a comma or bracket has to be quoted out of the way. */
const pgGroupVal = v => {
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  return /[,()"\\]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
};

function pgClause(c, inGroup = false) {
  if (c.or) return `or(${c.or.map(x => pgClause(x, true)).join(',')})`;
  const col = c.col;
  const val = inGroup ? pgGroupVal : pgVal;
  switch (c.op) {
    case 'isnull': return `or(${col}.is.null,${col}.eq.)`;
    case 'notnull': return `and(${col}.not.is.null,${col}.neq.)`;
    case 'in': return (c.val || []).length ? `${col}.in.(${(c.val).map(pgGroupVal).join(',')})` : `${col}.is.null`;
    case 'nin': return (c.val || []).length ? `${col}.not.in.(${(c.val).map(pgGroupVal).join(',')})` : `${col}.not.is.null`;
    case 'like': return `${col}.ilike.${val('*' + c.val + '*')}`;
    case 'neq': return `${col}.neq.${val(c.val)}`;
    case 'gt': return `${col}.gt.${val(c.val)}`;
    case 'gte': return `${col}.gte.${val(c.val)}`;
    case 'lt': return `${col}.lt.${val(c.val)}`;
    case 'lte': return `${col}.lte.${val(c.val)}`;
    default: return `${col}.eq.${val(c.val)}`;
  }
}

/**
 * Percent-encodes the query string itself rather than using
 * URLSearchParams.toString(), which encodes a space as "+". PostgREST does
 * decode "+" back to a space, but a search term is not worth betting on that.
 */
const qs = params => [...params.entries()]
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&');

/** Top-level clauses AND together; anything with `or` becomes one `or=` param. */
function pgParams(opts) {
  const p = new URLSearchParams();
  const ands = [];
  for (const c of opts.where || []) {
    if (c.or) { ands.push(pgClause(c)); continue; }
    const rendered = pgClause(c);
    // `col.op.value` splits into a query param, except the compound forms.
    if (rendered.startsWith('or(') || rendered.startsWith('and(')) { ands.push(rendered); continue; }
    const at = rendered.indexOf('.');
    p.append(rendered.slice(0, at), rendered.slice(at + 1));
  }
  if (opts.search && opts.search.term) {
    const t = `*${opts.search.term}*`;
    ands.push(`or(${opts.search.cols.map(c => `${c}.ilike.${pgGroupVal(t)}`).join(',')})`);
  }
  for (const a of ands) {
    if (a.startsWith('or(')) p.append('or', a.slice(2));
    else p.append('and', a.slice(3));
  }
  p.set('select', opts.columns ? opts.columns.join(',') : '*');
  if (opts.order && opts.order.length) {
    p.set('order', opts.order
      .map(o => `${o.col}.${String(o.dir).toLowerCase() === 'desc' ? 'desc' : 'asc'}.nullslast`)
      .join(','));
  }
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.offset) p.set('offset', String(opts.offset));
  return p;
}

async function sbFetch(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${init && init.method || 'GET'} ${res.status}: ${text.slice(0, 400)}`);
  }
  return res;
}

const supabaseDriver = {
  async select(table, opts = {}) {
    const res = await sbFetch(`${sbUrl(table)}?${qs(pgParams(opts))}`, { headers: sbHeaders() });
    return res.json();
  },

  async count(table, opts = {}) {
    const p = pgParams({ ...opts, limit: 1, offset: 0, order: null });
    const res = await sbFetch(`${sbUrl(table)}?${qs(p)}`, {
      headers: sbHeaders({ Prefer: 'count=exact', Range: '0-0' }),
    });
    const range = res.headers.get('content-range') || '0-0/0';
    return parseInt(range.split('/')[1], 10) || 0;
  },

  async insertMany(table, rows) {
    if (!rows.length) return [];
    // PostgREST caps request size, and a 5,000 row import would blow it.
    const out = [];
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      await sbFetch(sbUrl(table), {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(chunk),
      });
      out.push(...chunk);
    }
    return out;
  },

  async update(table, where, patch) {
    const res = await sbFetch(`${sbUrl(table)}?${qs(pgParams({ where }))}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=headers-only,count=exact' }),
      body: JSON.stringify(patch),
    });
    const range = res.headers.get('content-range') || '*/0';
    return parseInt(range.split('/')[1], 10) || 0;
  },

  async remove(table, where) {
    const res = await sbFetch(`${sbUrl(table)}?${qs(pgParams({ where }))}`, {
      method: 'DELETE',
      headers: sbHeaders({ Prefer: 'return=headers-only,count=exact' }),
    });
    const range = res.headers.get('content-range') || '*/0';
    return parseInt(range.split('/')[1], 10) || 0;
  },
};

/* -------------------------------------------------------------------- facade */

const impl = () => (driver() === 'supabase' ? supabaseDriver : sqliteDriver);

export const select = (table, opts) => impl().select(table, opts);
export const count = (table, opts) => impl().count(table, opts);

export async function first(table, opts) {
  const rows = await impl().select(table, { ...opts, limit: 1 });
  return rows[0] || null;
}

export const byId = (table, id) => first(table, { where: [{ col: 'id', op: 'eq', val: id }] });

export async function insert(table, row) {
  const full = { id: newId(), created_at: nowISO(), ...shape(table, row) };
  if (!full.id) full.id = newId();
  await impl().insertMany(table, [full]);
  return full;
}

export async function insertMany(table, rows) {
  const stamped = rows.map(r => ({ id: newId(), created_at: nowISO(), ...shape(table, r) }));
  await impl().insertMany(table, stamped);
  return stamped;
}

export async function update(table, id, patch) {
  const clean = shape(table, patch);
  if ('updated_at' in TABLES[table].columns) clean.updated_at = nowISO();
  delete clean.id;
  await impl().update(table, [{ col: 'id', op: 'eq', val: id }], clean);
  return byId(table, id);
}

export const updateWhere = (table, where, patch) => impl().update(table, where, shape(table, patch));
export const remove = (table, where) => impl().remove(table, where);

/** Upsert on a single key. Used for settings and for the day's queue. */
export async function put(table, key, row) {
  const existing = await first(table, { where: [{ col: 'id', op: 'eq', val: key }] });
  if (existing) return update(table, key, row);
  return insert(table, { ...row, id: key });
}

/** For the CLI and tests. Creates tables on sqlite; a no-op against Supabase. */
export async function init() {
  if (driver() === 'sqlite') sqlite();
  return driver();
}
