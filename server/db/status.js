let databaseReady = false;
let initPromise = null;

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
        await initFn();
        databaseReady = true;
        return true;
      } catch (error) {
        databaseReady = false;
        throw error;
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
