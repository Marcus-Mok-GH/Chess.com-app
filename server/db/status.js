let databaseReady = false;

export function setDatabaseReady(ready) {
  databaseReady = Boolean(ready);
}

export function isDatabaseReady() {
  return databaseReady;
}
