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
import puzzleRoutes from './routes/puzzles.js';
import openingRoutes from './routes/openings.js';
import lessonRoutes from './routes/lessons.js';
import { registerSocketHandlers } from './socket/index.js';
import { query } from './db.js';
import { initDatabase } from './db/init.js';
import { setDatabaseReady } from './db/status.js';

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

// Auth routes perform their own database work through the shared query helper,
// which lazily initializes and self-heals the schema when needed. Do not gate
// the entire auth router behind a cold-start init middleware: if that init fails
// once on Vercel, users only see the misleading "Auth service is starting"
// response even though the service is not actually warming up.
const startServerlessDatabaseWarmup = () => {
  if (!process.env.VERCEL) return;

  initDatabase()
    .then(() => {
      setDatabaseReady(true);
      console.log('✅ Database warm-up completed for serverless auth routes');
    })
    .catch((err) => {
      setDatabaseReady(false);
      console.warn('[DB] Background serverless database warm-up failed; auth routes will retry on demand:', err?.message || err);
    });
};

startServerlessDatabaseWarmup();

// Routes
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/engine', engineRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api/openings', openingRoutes);
app.use('/api/lessons', lessonRoutes);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: 'API endpoint not found.' } });
});

// Static files are served only by the standalone production server. Vercel
// serves the frontend from its output directory and imports this app solely as
// the /api/* function, where the frontend bundle is not present.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('/*all', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Socket.IO
io.on('connection', (socket) => {
  try {
    registerSocketHandlers(io, socket);
  } catch (err) {
    console.error('[Socket Error]:', err);
  }
});

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

// Global error handler — ensures every uncaught error in routes/middleware
// returns a clean JSON 500 instead of HTML or empty body (which produces the
// generic "Request failed (500)" in the client).
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled route error:', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: { message: 'Internal server error. Please try again later.' } });
});

// Export app so api/[...path].js can use it as a Vercel serverless handler.
export default app;