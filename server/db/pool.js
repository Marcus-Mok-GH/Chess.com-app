import pg from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Pool } = pg;

// Prefer pooled connection URLs for general-purpose queries.
// Direct/unpooled URLs (db.xxx.supabase.co) require a persistent TCP connection to
// port 5432 which is not available in serverless environments (Vercel, AWS Lambda).
// Keep them as a last resort so local dev still works if only the direct URL is set.
const connectionCandidates = [
  ['POSTGRES_URL', process.env.POSTGRES_URL],
  ['DATABASE_URL', process.env.DATABASE_URL],
  ['POSTGRES_URL_NON_POOLING', process.env.POSTGRES_URL_NON_POOLING],
  ['DATABASE_URL_UNPOOLED', process.env.DATABASE_URL_UNPOOLED],
];

let connectionSource = null;
let connectionString = null;
for (const [key, value] of connectionCandidates) {
  if (value) {
    connectionSource = key;
    connectionString = value;
    break;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

let dbHost = null;
try {
  if (connectionString) {
    dbHost = new URL(connectionString).hostname;
  }
} catch {
  // ignore parsing errors; avoid logging secrets
}

const isNeonHost = dbHost && dbHost.includes('neon.tech');
const useNeonServerless = Boolean(process.env.NEON_PROJECT_ID || isNeonHost);

if (useNeonServerless) {
  try {
    const wsModule = require('ws');
    neonConfig.webSocketConstructor = wsModule;
  } catch {
    // ws not available (e.g. edge runtime) — Neon driver falls back to fetch
  }
  neonConfig.poolQueryViaFetch = true;
  neonConfig.useSecureWebSocket = true;
}

const PoolImpl = useNeonServerless ? NeonPool : Pool;

const poolConfig = useNeonServerless
  ? { connectionString }
  : {
      connectionString,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: isProduction ? 20000 : 10000,
      idleTimeoutMillis: 30000,
      max: 10,
      family: 4
    };

let didLog = false;
function logConnectionTarget() {
  if (didLog) return;
  if (!connectionString) {
    console.warn('[DB] No database URL found in environment variables.');
    didLog = true;
    return;
  }
  if (!dbHost) {
    console.warn('[DB] Database URL is set but could not parse host.');
    didLog = true;
    return;
  }
  const driver = useNeonServerless ? 'neon-serverless' : 'pg';
  const sourceLabel = connectionSource ? ` via ${connectionSource}` : '';
  console.log(`[DB] Connecting to ${dbHost} using ${driver}${sourceLabel}`);
  didLog = true;
}

export const shouldClosePool = useNeonServerless;

const sharedPool = useNeonServerless ? null : new PoolImpl(poolConfig);

export function getPool() {
  logConnectionTarget();
  return useNeonServerless ? new PoolImpl(poolConfig) : sharedPool;
}

// Supabase docs recommend using the direct (unpooled) connection for DDL/migrations.
// This helper returns a pool pointed at the direct connection string when available,
// and falls back to the regular shared pool if no separate direct URL is configured.
// See: https://supabase.com/docs/guides/database/connecting-to-postgres
//
// NOTE: On Vercel (and other serverless platforms) direct connections to
// db.xxx.supabase.co are NOT reachable — the platform blocks raw TCP to port 5432.
// In that case we skip the direct pool entirely and let DDL run over the pooler.
const isServerlessEnv = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const directCandidates = [
  process.env.DATABASE_URL_UNPOOLED,
  process.env.POSTGRES_URL_NON_POOLING,
];
const directConnectionString = directCandidates.find(Boolean) ?? null;

let directPool = null;
if (!useNeonServerless && !isServerlessEnv && directConnectionString && directConnectionString !== connectionString) {
  directPool = new Pool({
    connectionString: directConnectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: isProduction ? 20000 : 10000,
    idleTimeoutMillis: 30000,
    max: 2, // DDL only — keep it small
    family: 4
  });
}

export function getDirectPool() {
  return directPool ?? getPool();
}

export default sharedPool ?? null;
