import pg from 'pg';

const { Pool } = pg;
const isProduction = process.env.NODE_ENV === 'production';
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isVercel = Boolean(process.env.VERCEL);

const pooledUrl = process.env.DATABASE_URL;
const unpooledUrl = process.env.DATABASE_URL_UNPOOLED ?? pooledUrl;

function resolveHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isNeonPooler(url) {
  const host = resolveHost(url) ?? '';
  return host.includes('neon.tech') && host.includes('-pooler');
}

if (pooledUrl) {
  const host = resolveHost(pooledUrl);
  console.log(`[DB] DATABASE_URL (pooled) -> ${host ?? '(unparseable)'}`);

  if (isServerless && host?.includes('neon.tech') && !host.includes('-pooler')) {
    console.warn('[DB] Neon detected on serverless without -pooler host. Use a pooled Neon connection string for Vercel/Functions.');
  }
} else {
  console.warn('[DB] DATABASE_URL not set');
}

if (!isServerless && unpooledUrl && unpooledUrl !== pooledUrl) {
  const host = resolveHost(unpooledUrl);
  console.log(`[DB] DATABASE_URL_UNPOOLED (direct) -> ${host ?? '(unparseable)'}`);
}

const sslConfig = isProduction
  ? { rejectUnauthorized: true, ...(process.env.DATABASE_CA ? { ca: process.env.DATABASE_CA } : {}) }
  : false;
const timeoutMs = isServerless ? 8000 : isProduction ? 20000 : 10000;
const pooledHost = resolveHost(pooledUrl);
const isNeonOnVercel = isVercel && Boolean(pooledUrl) && isNeonPooler(pooledUrl);

// node-postgres emits 'error' on a Pool when an *idle* pooled client's socket
// dies (the database or its proxy closed the connection while a serverless
// instance sat frozen after a long idle period — idle timers do not run while
// the instance is frozen, so stale idle clients survive until the next
// request). pg already discards the broken client, but with no 'error'
// listener EventEmitter's default behavior throws, killing the function
// process and surfacing as a 500 FUNCTION_INVOCATION_FAILED. Log and swallow
// the error instead; a genuinely unusable socket still fails the query that
// checks it out, which the existing try/catch paths already handle.
function attachPoolErrorHandler(pool, label) {
  if (!pool) {
    return pool;
  }

  pool.on('error', (error) => {
    console.error(`[DB] ${label} emitted an error on an idle client (recovered):`, error?.message || error);
  });

  return pool;
}

const sharedPool = attachPoolErrorHandler(
  pooledUrl
    ? new Pool({
        connectionString: pooledUrl,
        ssl: sslConfig,
        connectionTimeoutMillis: timeoutMs,
        idleTimeoutMillis: isNeonOnVercel ? 5000 : 30000,
        max: isNeonOnVercel ? 5 : 10,
        allowExitOnIdle: true,
        ...(isServerless && pooledHost?.includes('supabase.co') ? { family: 4 } : {})
      })
    : null,
  'shared pool',
);


const directPool = attachPoolErrorHandler(
  !isServerless && unpooledUrl && unpooledUrl !== pooledUrl
    ? new Pool({ 
        connectionString: unpooledUrl,
        ssl: sslConfig,
        connectionTimeoutMillis: timeoutMs,
        idleTimeoutMillis: 30000,
        max: 2,
        allowExitOnIdle: true
      })
    : null,
  'direct pool',
);

export const shouldClosePool = false;

export function getPool() {
  return sharedPool;
}

export function getDirectPool() {
  return directPool ?? sharedPool;
}

export default sharedPool;