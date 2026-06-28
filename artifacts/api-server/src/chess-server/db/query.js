import { getPool, shouldClosePool } from './pool.js';
import { ensureDatabaseReady, setDatabaseReady, isDatabaseReady } from './status.js';
import { initDatabase } from './init.js';

const logQuery = (text, duration, rowCount) => {
  console.log('[DB] Query executed', {
    text: text.substring(0, 50),
    duration,
    rows: rowCount
  });
};

export async function query(text, params) {
  // On serverless (Vercel), we must ensure the database is initialized and 
  // schema is present before the first query. index.js skips background 
  // init on Vercel to avoid blocking the handler start, so we do it here.
  if (!isDatabaseReady()) {
    const ready = await ensureDatabaseReady(initDatabase);
    if (!ready) {
      throw new Error('Database failed to initialize');
    }
  }

  const start = Date.now();
  const pool = getPool();
  let res;
  try {
    res = await pool.query(text, params);
  } catch (error) {
    // 42P01: undefined_table
    // 42703: undefined_column (e.g. after a schema migration that added a column)
    const needsRetry = error?.code === '42P01' || error?.code === '42703';
    
    if (!needsRetry) {
      throw error;
    }

    console.warn(`[DB] Schema issue detected (${error.code}). Re-initializing and retrying once.`);
    setDatabaseReady(false);
    const restored = await ensureDatabaseReady(initDatabase);
    if (!restored) {
      throw error;
    }
    res = await pool.query(text, params);
  }
  const duration = Date.now() - start;
  logQuery(text, duration, res.rowCount);
  if (shouldClosePool) {
    await pool.end();
  }
  return res;
}

export default query;