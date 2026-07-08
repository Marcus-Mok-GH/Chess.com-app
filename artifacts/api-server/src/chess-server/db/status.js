let databaseReady = false;
let initPromise = null;

// Delays (ms) between successive DB init attempts.
//
// Vercel serverless functions have a hard ~15s execution ceiling for the
// Hobby plan (60s on Pro). Neon compute can take 2–6s to wake from cold.
// A single 4s backoff gives Neon one retry chance while still leaving
// enough headroom for the actual query — important for the OTP sign-in
// flow which proxies to Neon Auth and is the user-facing "first request"
// after a cold start.
//
// 1 retry × 4 s = up to 4 s total wait, vs. the previous 2 × 5 s = 10 s
// which routinely blew past Vercel's ceiling and produced the
// "Failed to send code" error users saw on the login screen.
const DB_INIT_RETRY_DELAYS_MS = [4000];

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
                `[DB] Init attempt ${attempt}/${maxAttempts} failed: ${error instanceof Error ? error.message : String(error)}. ` +
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
