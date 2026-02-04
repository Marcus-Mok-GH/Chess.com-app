import pg from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const { Pool } = pg;

const connectionCandidates = [
  ['DATABASE_URL_UNPOOLED', process.env.DATABASE_URL_UNPOOLED],
  ['POSTGRES_URL_NON_POOLING', process.env.POSTGRES_URL_NON_POOLING],
  ['POSTGRES_PRISMA_URL', process.env.POSTGRES_PRISMA_URL],
  ['POSTGRES_URL', process.env.POSTGRES_URL],
  ['DATABASE_URL', process.env.DATABASE_URL]
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

if (dbHost) {
  const sourceLabel = connectionSource ? ` via ${connectionSource}` : '';
  console.log(`[DB] Connecting to ${dbHost} (IPv4 preferred)${sourceLabel}`);
}

const useNeonServerless = Boolean(process.env.VERCEL || process.env.NEON_PROJECT_ID);
if (useNeonServerless) {
  neonConfig.webSocketConstructor = ws;
}

const PoolImpl = useNeonServerless ? NeonPool : Pool;

const pool = new PoolImpl({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: isProduction ? 20000 : 10000,
  idleTimeoutMillis: 30000,
  max: 10,
  family: 4
});

export default pool;
