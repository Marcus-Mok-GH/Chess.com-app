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
  console.log(`[DB] DATABASE_URL (pooled) → ${host ?? '(unparseable)'}`);

  if (isServerless && host?.includes('neon.tech') && !host.includes('-pooler')) {
    console.warn('[DB] Neon detected on serverless without -pooler host. Use a pooled Neon connection string for Vercel/Functions.');
  }
} else {
  console.warn('[DB] DATABASE_URL not set — database features will be disabled.');
}

const pooledHost = resolveHost(pooledUrl);
const isNeonOnVercel = isVercel && Boolean(pooledUrl) && isNeonPooler(pooledUrl);

// Many serverless environments have issues with system CA bundles. 
// For Neon/Supabase, we default to rejectUnauthorized: false unless 
// explicitly overridden, to ensure connectivity.
const sslConfig = isProduction 
  ? { rejectUnauthorized: false } 
  : false;

const timeoutMs = isProduction ? 20000 : 10000;

const sharedPool = pooledUrl
  ? new Pool({
      connectionString: pooledUrl,
      ssl: sslConfig,
      connectionTimeoutMillis: timeoutMs,
      idleTimeoutMillis: isNeonOnVercel ? 5000 : 30000,
      max: isNeonOnVercel ? 5 : 10,
      allowExitOnIdle: true,
      ...(isServerless && pooledHost?.includes('supabase.co') ? { family: 4 } : {})
    })
  : null;


const directPool = !isServerless && unpooledUrl && unpooledUrl !== pooledUrl
  ? new Pool({
      connectionString: unpooledUrl,
      ssl: sslConfig,
      connectionTimeoutMillis: timeoutMs,
      idleTimeoutMillis: 30000,
      max: 2,
      allowExitOnIdle: true
    })
  : null;

export const shouldClosePool = false;

export function getPool() {
  return sharedPool;
}

export function getDirectPool() {
  return directPool ?? sharedPool;
}

export default sharedPool;