import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';


// Load local environment variables only in non-production environments.
// On Vercel, rely on project env vars instead of bundled .env files.
const shouldLoadEnv = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
if (shouldLoadEnv) {
  config();
}

import { initDatabase, cleanupStaleMatchmakingEntries, cleanupOldActiveGames, query } from './db.js';
import { checkDatabaseConnection } from './db/init.js';
import { setDatabaseReady, isDatabaseReady, ensureDatabaseReady } from './db/status.js';
import { errorResponse } from './middleware/errors.js';
import { ensureAuthTables } from './db/migrations.js';
import authRouter from './routes/auth.js';
import { registerSocketHandlers } from './socket/index.js';
import { getMatchmakingService } from './socket/matchmaking.js';
import matchmakingRouter from './routes/matchmaking.js';
import gamesRouter from './routes/games.js';
import usersRouter from './routes/users.js';
import coachRouter from './routes/coach.js';
import engineRouter from './routes/engine.js';

// Validate environment variables
const hasDatabase = Boolean(process.env.DATABASE_URL);
if (!hasDatabase) {
  console.warn('[Server] WARNING: DATABASE_URL not set. Database features will be disabled.');
} else {
  console.log('[Server] Database URL detected.');
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'backend' });
});

app.get('/api/health', (req, res) => {
  const dbStatus = hasDatabase ? (isDatabaseReady() ? 'connected' : 'error') : 'disabled';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'backend',
    api: 'ready',
    database: dbStatus
  });
});

app.get('/api/stats/public', async (req, res) => {
  try {
    if (!hasDatabase) {
      return res.status(503).json({ error: 'Stats unavailable while database is offline.' });
    }

    if (!isDatabaseReady()) {
      const ready = await ensureDatabaseReady(initDatabase);
      if (!ready) {
        return res.status(503).json({ error: 'Stats unavailable while database is initializing.' });
      }
    }

    const [usersResult, gamesResult, activeGamesResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users'),
      query('SELECT COUNT(*)::int AS count FROM games'),
      query("SELECT COUNT(*)::int AS count FROM active_games WHERE status = 'active'")
    ]);

    const connectedClients = io?.engine?.clientsCount ?? 0;

    res.json({
      registeredPlayers: usersResult.rows[0]?.count ?? 0,
      gamesRecorded: gamesResult.rows[0]?.count ?? 0,
      liveGames: activeGamesResult.rows[0]?.count ?? 0,
      livePlayers: connectedClients,
      serverUptimeSeconds: Math.floor(process.uptime()),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Stats] Failed to generate landing stats:', error);
    return res.status(500).json({ error: 'Failed to load public stats.' });
  }
});

const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Startup validation: fail fast in production when no FRONTEND_URL/VERCEL_URL is set
if (isProduction && !process.env.FRONTEND_URL && !process.env.VERCEL_URL) {
  console.error('[Server] ERROR: Production mode requires FRONTEND_URL or VERCEL_URL to be set.');
  console.error('[Server] Please set one of these environment variables in your deployment configuration.');
  process.exit(1);
}

// FRONTEND_URL must be set explicitly in production.
// On Vercel, VERCEL_URL is injected automatically (without protocol).
const FRONTEND_URL = (process.env.FRONTEND_URL ||
  (isProduction
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:5173')).replace(/\/+$/, '');

// Explicit allowlist of trusted CORS origins.
const trustedOrigins = [
  FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '') : null,
  !isProduction ? 'http://localhost:5173' : null,
  !isProduction ? 'http://localhost:3001' : null,
].filter(Boolean);

const corsOrigin = isProduction
  ? (origin, callback) => {
      // In production, only allow explicitly trusted origins
      if (!origin || trustedOrigins.includes(origin)) {
        callback(null, origin || trustedOrigins[0]);
      } else {
        callback(null, false);
      }
    }
  : true; // In development, allow all origins for easier testing

const httpServer = createServer(app);
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Prevent hard-crash on port conflicts when running both Vite + server in one command.
// If the backend is already running (common on Replit reloads), we can keep the process alive
// for the frontend while warning the user.
httpServer.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} already in use. Backend may already be running.`);
    console.error('[Server] If matchmaking/API is not working, stop the other server process and restart.');
    return;
  }

  console.error('[Server] HTTP server error:', error);
});

// Prefer WebSocket when available but allow opting into polling-only deployments
let io = null;
if (!isServerless) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: process.env.FORCE_POLLING ? ['polling'] : ['websocket', 'polling'],
    allowEIO3: true
  });
}

// Middleware
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
// Vercel serverless functions strip the "/api" prefix from req.url. To keep
// routes working both locally (with "/api") and on Vercel (without it),
// mount the routers on both prefixes when running serverless.
const apiPrefixes = isServerless ? ['', '/api'] : ['/api'];
const mountApi = (pathPrefix, router) => {
  apiPrefixes.forEach((prefix) => {
    const fullPath = `${prefix}${pathPrefix}` || '/';
    app.use(fullPath, router);
  });
};

// Mount engine routes outside the database gate so they work independently
mountApi('/engine', engineRouter);

// Ensure the database is ready before handling API routes (skip health).
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  if (!hasDatabase) {
    return errorResponse(res, 503, 'Database not configured. Set DATABASE_URL in your deployment environment.');
  }
  if (!isDatabaseReady()) {
    const ready = await ensureDatabaseReady(initDatabase);
    if (!ready) {
      return errorResponse(res, 503, 'Database unavailable. Check DATABASE_URL connectivity.');
    }
  }
  return next();
});

mountApi('/auth', authRouter);
mountApi('/users', usersRouter);
mountApi('/matchmaking', matchmakingRouter);
mountApi('/games', gamesRouter);
mountApi('/coach', coachRouter);

// Serve static files from Vite dist directory
const distPath = path.join(__dirname, '../dist');
const distIndexPath = path.join(distPath, 'index.html');
const hasDistIndex = fs.existsSync(distIndexPath);
console.log(`[Server] Serving static files from: ${distPath}`);

if (hasDistIndex) {
  app.use(express.static(distPath, {
    maxAge: isProduction ? '1y' : '0',
    immutable: isProduction,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
}

if (!hasDistIndex && !isProduction) {
  console.warn('[Server] dist/index.html not found. Redirecting app routes to frontend dev server.');
}

if (!hasDistIndex && isProduction) {
  console.warn('[Server] dist/index.html not found. Did you run the frontend build?');
}

// SPA fallback - serve index.html for all non-API routes
// Use app.use without a path to avoid path-to-regexp '*' parsing issues.
app.use((req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  if (!hasDistIndex) {
    return res.redirect(`${FRONTEND_URL}${req.originalUrl}`);
  }
  res.sendFile(distIndexPath);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.io
if (io) {
  // Initialize matchmaking service immediately so it can process queued players
  getMatchmakingService(io);
  console.log('[Server] Matchmaking service initialized and running');

  io.on('connection', async (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    await registerSocketHandlers(io, socket);
  });
} else if (isServerless) {
  console.warn('[Server] Socket.IO disabled - running in serverless mode (Vercel/AWS Lambda).');
  console.warn('[Server] For real-time features (matchmaking, online games), deploy the backend server to a platform that supports WebSockets.');
  console.warn('[Server] Then set VITE_SOCKET_URL environment variable on Vercel to point to your external Socket.IO server.');
  console.warn('[Server] Example: VITE_SOCKET_URL=https://your-socket-server.railway.app');
}

// Periodic cleanup - also run in serverless mode via cron or external trigger
if (!isServerless) {
  setInterval(async () => {
    await cleanupStaleMatchmakingEntries();
    await cleanupOldActiveGames();
  }, 60000);
}

// In serverless mode, run cleanup on each request occasionally
if (isServerless) {
  let lastCleanup = 0;
  const CLEANUP_INTERVAL = 60000; // 1 minute
  
  app.use((req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL) {
      lastCleanup = now;
      // Don't await - run in background
      cleanupStaleMatchmakingEntries().catch(console.error);
      cleanupOldActiveGames().catch(console.error);
    }
    next();
  });
}

async function start() {
  if (hasDatabase) {
    try {
      // Always run schema initialization on startup. All CREATE TABLE statements
      // use IF NOT EXISTS so this is safe and idempotent on every cold start.
      console.log('[Server] Initializing database...');
      const timeoutMs = isServerless ? 60000 : 15000;

      // Ensure auth tables exist (verifications, sessions, users, accounts)
      await ensureAuthTables().catch(err => console.error('[Server] Auth table migration failed:', err));

      const checkAction = initDatabase;
      const actionName = 'initialization';

      await Promise.race([
        checkAction(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Database ${actionName} timeout after ${timeoutMs / 1000}s`)), timeoutMs)
        )
      ]);

      // initDatabase() returns void — success is signalled by not throwing.
      setDatabaseReady(true);
      console.log(`[Server] Database ${actionName} successful`);
    } catch (error) {
      setDatabaseReady(false);
      console.error('[Server] Database startup failed:', error.message);
      if (!isServerless) {
        process.exit(1);
      }
    }
  } else {
    setDatabaseReady(false);
    console.warn('[Server] Skipping database initialization. DATABASE_URL is not set.');
  }

  if (!isServerless) {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      if (isProduction) {
        console.log(`Serving app from: ${distPath}`);
      }
    });
  }
}

start();

export default app;
