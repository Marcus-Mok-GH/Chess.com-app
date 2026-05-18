import pg from 'pg';

const { Pool } = pg;
const isProduction = process.env.NODE_ENV === 'production';

// On Vercel/serverless, db.[ref].supabase.co is IPv6-only by default and Vercel
// only has IPv4 egress — skip the direct pool entirely and fall back to pooled.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

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

if (!isServerless && unpooledUrl && unpooledUrl !== pooledUrl) {
  const host = resolveHost(unpooledUrl);
  console.log(`[DB] DATABASE_URL_UNPOOLED (direct) → ${host ?? '(unparseable)'}`);
} else if (isServerless && unpooledUrl && unpooledUrl !== pooledUrl) {
  console.log('[DB] DATABASE_URL_UNPOOLED ignored on serverless (IPv4-only) — using pooled connection for DDL.');
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
// Skipped on Vercel/serverless — db.[ref].supabase.co is IPv6-only by default
// and Vercel only has IPv4 egress. Schema init falls back to sharedPool instead.
// To use the direct connection on Vercel, enable the Supabase IPv4 add-on:
// https://supabase.com/docs/guides/platform/ipv4-address
const directPool = !isServerless && unpooledUrl && unpooledUrl !== pooledUrl
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
