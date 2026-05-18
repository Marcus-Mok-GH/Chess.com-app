import pg from 'pg';

const { Pool } = pg;
const isProduction = process.env.NODE_ENV === 'production';

// Supabase pooled connection (Supavisor session mode, port 5432) — use for all normal queries.
// Session mode is IPv4-compatible and supports prepared statements.
// Username format: postgres.[project-ref] (includes project ref)
const pooledUrl = process.env.DATABASE_URL;

// Supabase direct/unpooled connection (port 5432) — use for DDL/migrations.
// Falls back to pooled URL if not set.
const unpooledUrl = process.env.DATABASE_URL_UNPOOLED ?? pooledUrl;

function resolveHost(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

if (pooledUrl) {
  const host = resolveHost(pooledUrl);
  console.log(`[DB] DATABASE_URL (pooled) → ${host ?? '(unparseable)'}`);
} else {
  console.warn('[DB] DATABASE_URL not set — database features will be disabled.');
}

if (unpooledUrl && unpooledUrl !== pooledUrl) {
  const host = resolveHost(unpooledUrl);
  console.log(`[DB] DATABASE_URL_UNPOOLED (direct) → ${host ?? '(unparseable)'}`);
}

const sslConfig = isProduction ? { rejectUnauthorized: true } : false;
const timeoutMs = isProduction ? 20000 : 10000;

const sharedPool = pooledUrl
  ? new Pool({
      connectionString: pooledUrl,
      ssl: sslConfig,
      connectionTimeoutMillis: timeoutMs,
      idleTimeoutMillis: 30000,
      max: 10,
      family: 4
    })
  : null;

// Small pool for DDL/migrations (direct unpooled connection).
// See: https://supabase.com/docs/guides/database/connecting-to-postgres
// NOTE: Supabase direct connections (db.[ref].supabase.co:5432) are IPv6-only by
// default. On Vercel (IPv4-only), either enable the Supabase IPv4 add-on or omit
// DATABASE_URL_UNPOOLED — schema init will then fall back to the pooled connection.
const directPool = unpooledUrl && unpooledUrl !== pooledUrl
  ? new Pool({
      connectionString: unpooledUrl,
      ssl: sslConfig,
      connectionTimeoutMillis: timeoutMs,
      idleTimeoutMillis: 30000,
      max: 2
    })
  : null;

// Always false for pg.Pool (kept for interface compatibility with query.js / init.js)
export const shouldClosePool = false;

export function getPool() {
  return sharedPool;
}

export function getDirectPool() {
  return directPool ?? sharedPool;
}

export default sharedPool;
