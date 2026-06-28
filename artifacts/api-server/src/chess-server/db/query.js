import { getPool, shouldClosePool } from './pool.js';
import { ensureDatabaseReady, setDatabaseReady, isDatabaseReady } from './status.js';
import { initDatabase } from './init.js';

export async function query(text, params) {
  if (!isDatabaseReady()) {
    await ensureDatabaseReady(initDatabase);
  }

  const pool = getPool();
  if (!pool) {
    throw new Error('DATABASE_URL is missing');
  }

  const res = await pool.query(text, params);
  
  if (shouldClosePool) {
    await pool.end();
  }
  return res;
}

export default query;