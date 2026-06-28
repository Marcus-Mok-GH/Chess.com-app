import pg from 'pg';

const { Pool } = pg;
const isProduction = process.env.NODE_ENV === 'production';

const pooledUrl = process.env.DATABASE_URL;

const sharedPool = pooledUrl
  ? new Pool({
      connectionString: pooledUrl,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 20000,
      max: 10,
    })
  : null;

export function getPool() {
  return sharedPool;
}

export function getDirectPool() {
  return sharedPool;
}

export const shouldClosePool = false;
export default sharedPool;