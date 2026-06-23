import { initDatabase } from './init.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('[DB Setup] Starting database initialization...');

initDatabase()
  .then(() => {
    console.log('[DB Setup] Database initialization complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[DB Setup] Database initialization failed:', error);
    process.exit(1);
  });
