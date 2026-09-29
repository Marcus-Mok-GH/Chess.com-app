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

// 42P01 = undefined_table, 42703 = undefined_column. Either one means this
// deployment's schema is behind the code (usually a database that predates a
// new column), so the correct response is to create the missing schema rather
// than surfacing a 500 to the user.
const isSchemaMissing = (error) =>
  error?.code === '42P01' || error?.code === '42703';

async function repairSchema() {
  setDatabaseReady(false);
  // force: a missing table/column means the stored schema version is wrong,
  // so re-run the full DDL even if the version check would skip it.
  return ensureDatabaseReady(() => initDatabase({ force: true }));
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
    if (!isSchemaMissing(error)) {
      throw error;
    }

    console.warn(`[DB] Schema issue detected (${error.code}). Re-initializing.`);
    const restored = await repairSchema();
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


async function runTransaction(callback) {
  const pool = getPool();
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

export async function withTransaction(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('withTransaction requires a callback');
  }

  await ensureReadyForQuery();
  if (!getPool()) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }

  try {
    return await runTransaction(callback);
  } catch (error) {
    // Transactions are the paths that create and join games, so a schema that
    // predates a new column would otherwise fail them outright (the plain
    // query self-heal below does not cover work done inside a transaction).
    // The failed attempt has already rolled back, so retrying from a clean
    // transaction is safe — every caller is pure database work.
    if (!isSchemaMissing(error)) {
      throw error;
    }

    console.warn(`[DB] Schema issue detected in transaction (${error.code}). Re-initializing.`);
    const restored = await repairSchema();
    if (!restored) {
      throw error;
    }
    return runTransaction(callback);
  }
}

export default query;