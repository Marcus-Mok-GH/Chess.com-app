import { getPool, shouldClosePool } from './pool.js';
import { ensureDatabaseReady, setDatabaseReady } from './status.js';
import { initDatabase } from './init.js';

const logQuery = (text, duration, rowCount) => {
  console.log('[DB] Query executed', {
    text: text.substring(0, 50),
    duration,
    rows: rowCount
  });
};

export async function query(text, params) {
  const start = Date.now();
  const pool = getPool();
  
  if (!pool) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }

  let res;
  try {
    res = await pool.query(text, params);
  } catch (error) {
    // Check for missing tables or columns (42P01: undefined_table, 42703: undefined_column)
    const needsInit = error?.code === '42P01' || error?.code === '42703';
    if (!needsInit) {
      throw error;
    }

    console.warn(`[DB] Schema issue detected (${error.code}). Re-initializing and retrying query once.`);
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