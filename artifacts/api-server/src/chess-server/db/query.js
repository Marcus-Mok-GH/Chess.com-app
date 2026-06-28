import { getPool } from './pool.js';
import { ensureDatabaseReady, isDatabaseReady } from './status.js';
import { initDatabase } from './init.js';

export async function query(text, params) {
  try {
    if (!isDatabaseReady()) {
      await ensureDatabaseReady(initDatabase);
    }

    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_URL is missing');
    }

    return await pool.query(text, params);
  } catch (error) {
    console.error('[DB] Query error:', error.message);
    throw error;
  }
}

export default query;