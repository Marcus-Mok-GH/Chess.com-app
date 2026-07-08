import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { corsOptions } from './config/cors.js';
import matchmakingRoutes from './routes/matchmaking.js';
import gameRoutes from './routes/games.js';
import userRoutes from './routes/users.js';
import coachRoutes from './routes/coach.js';
import engineRoutes from './routes/engine.js';
import authRoutes from './routes/auth.js';
import statsRoutes from './routes/stats.js';
import { registerSocketHandlers } from './socket/index.js';
import { query } from './db.js';
import { initDatabase } from './db/init.js';
import { ensureDatabaseReady } from './db/status.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// In serverless (Vercel) the boot-time checkDbConnection below does NOT run,
// so the first request after a cold start can hit a function with no tables
// created yet. Ensure the schema exists on every request — `initDatabase()`
// is idempotent (`CREATE TABLE IF NOT EXISTS`) and the readiness promise is
// memoized, so the cost on a warm function is one in-memory boolean check.
let _serverlessDbReadyPromise = null;
async function ensureServerlessDb() {
  if (!_serverlessDbReadyPromise) {
    _serverlessDbReadyPromise = ensureDatabaseReady(initDatabase).finally(() => {
      // Allow retry on the next request if init failed (e.g. cold Neon
      // wake-up), but coalesce concurrent requests in flight right now.
      setTimeout(() => { _serverlessDbReadyPromise = null; }, 0);
    });
  }
  return _serverlessDbReadyPromise;
}
app.use(async (req, res, next) => {
  if (process.env.VERCEL) {
    try {
      await ensureServerlessDb();
    } catch (err) {
      console.error('[DB] Serverless pre-request init failed:', err?.message || err);
    }
  }
  next();
});

// Routes
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/engine', engineRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Static files (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Socket.IO
io.on('connection', (socket) => registerSocketHandlers(io, socket));

// Database connection check and cleanup job
const checkDbConnection = async () => {
  try {
    await query('SELECT NOW()');
    console.log('✅ Database connected');
    await initDatabase();
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
};

const cleanupStaleGames = async () => {
  try {
    const result = await query(
      "DELETE FROM active_games WHERE updated_at < NOW() - INTERVAL '2 hours' AND status != 'playing'"
    );
    if (result.rowCount > 0) {
      console.log(`[Cleanup] Removed ${result.rowCount} stale games`);
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up stale games:', error);
  }
};

// In serverless environments (Vercel) the module is imported as a handler —
// binding a port is unnecessary and will fail silently. Only start the HTTP
// listener when running as a standalone process.
const PORT = process.env.PORT || 3001;
if (!process.env.VERCEL) {
  (async () => {
    await checkDbConnection();
    setInterval(cleanupStaleGames, 1000 * 60 * 30); // Every 30 minutes
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })();
}

// Export app so api/[...path].js can use it as a Vercel serverless handler.
export default app;
