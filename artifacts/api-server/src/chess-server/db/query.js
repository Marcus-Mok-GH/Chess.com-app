import { getPool, shouldClosePool } from './pool.js';
import { ensureDatabaseReady, setDatabaseReady, isDatabaseReady } from './status.js';
import { initDatabase } from './init.js';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const logQuery = (text, duration, rowCount) => {
  console.log('[DB] Query executed', {
    text: text.substring(0, 50),
    duration,
    rows: rowCount
  });
};

async function ensureReadyForQuery() {
  // Vercel runs initDatabase() in the background during cold start. Do not
  // block ordinary requests on the full schema bootstrap; existing tables can
  // serve immediately, and the schema-missing fallback below still self-heals.
  if (!isServerless && !isDatabaseReady()) {
    const ready = await ensureDatabaseReady(initDatabase);
    if (!ready) {
      throw new Error('Database failed to initialize');
    }
  }
}

export async function query(text, params) {
  await ensureReadyForQuery();

  const start = Date.now();
  const pool = getPool();
  if (!pool) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }

  let res;
  try {
    res = await pool.query(text, params);
  } catch (error) {
    const needsInit = error?.code === '42P01' || error?.code === '42703';
    if (!needsInit) {
      throw error;
    }

    console.warn(`[DB] Schema issue detected (${error.code}). Re-initializing.`);
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


export async function withTransaction(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('withTransaction requires a callback');
  }

  await ensureReadyForQuery();
  const pool = getPool();
  if (!pool) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Transaction rollback failed:', rollbackError?.message || rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export default query;