let databaseReady = false;
let initPromise = null;

// Delays (ms) between successive DB init attempts.
// 2 retries × 5 s = up to 10 s total wait — enough for Neon compute to wake from cold.
const DB_INIT_RETRY_DELAYS_MS = [5000, 5000];

export function setDatabaseReady(ready) {
  databaseReady = Boolean(ready);
}

export function isDatabaseReady() {
  return databaseReady;
}

export async function ensureDatabaseReady(initFn) {
  if (databaseReady) return true;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const maxAttempts = 1 + DB_INIT_RETRY_DELAYS_MS.length;
        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await initFn();
            databaseReady = true;
            return true;
          } catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
              const delayMs = DB_INIT_RETRY_DELAYS_MS[attempt - 1];
              console.warn(
                `[DB] Init attempt ${attempt}/${maxAttempts} failed: ${error.message}. ` +
                `Waiting ${delayMs / 1000}s for DB to wake up before retrying...`
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
        }

        databaseReady = false;
        throw lastError;
      } finally {
        initPromise = null;
      }
    })();
  }

  try {
    await initPromise;
    return databaseReady;
  } catch (error) {
    console.error('[DB] Initialization failed in ensureDatabaseReady:', error?.message || error);
    return false;
  }
}
