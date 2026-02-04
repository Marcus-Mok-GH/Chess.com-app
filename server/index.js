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

import { initDatabase, cleanupStaleMatchmakingEntries, cleanupOldActiveGames } from './db.js';
import { setDatabaseReady, isDatabaseReady, ensureDatabaseReady } from './db/status.js';
import { errorResponse } from './middleware/errors.js';
import { registerSocketHandlers } from './socket/index.js';
import matchmakingRouter from './routes/matchmaking.js';
import gamesRouter from './routes/games.js';
import usersRouter from './routes/users.js';
import coachRouter from './routes/coach.js';

// Validate environment variables
const databaseUrl = process.env.DATABASE_URL
  || process.env.DATABASE_URL_UNPOOLED
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.POSTGRES_PRISMA_URL
  || process.env.POSTGRES_URL;
const hasDatabase = Boolean(databaseUrl);
if (!hasDatabase) {
  console.warn('[Server] WARNING: DATABASE_URL (or POSTGRES_URL) not set. Database features will be disabled.');
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

const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Get frontend URL from environment or use default
const FRONTEND_URL = process.env.FRONTEND_URL || (isProduction ? process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.NETLIFY_URL
    ? `https://${process.env.NETLIFY_URL}`
    : process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : 'https://your-domain.com'
  : 'http://localhost:5173');

// In development, allow all origins for easier testing
// In production, restrict to the configured FRONTEND_URL
const corsOrigin = isProduction ? FRONTEND_URL : true;

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
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure the database is ready before handling API routes (skip health).
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  if (!hasDatabase) {
    return errorResponse(res, 503, 'Database not configured. Set DATABASE_URL (or POSTGRES_URL) in your deployment environment.');
  }
  if (!isDatabaseReady()) {
    const ready = await ensureDatabaseReady(initDatabase);
    if (!ready) {
      return errorResponse(res, 503, 'Database unavailable. Check DATABASE_URL/POSTGRES_URL connectivity.');
    }
  }
  return next();
});

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
  io.on('connection', async (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    await registerSocketHandlers(io, socket);
  });
}

// Periodic cleanup
if (!isServerless) {
  setInterval(async () => {
    await cleanupStaleMatchmakingEntries();
    await cleanupOldActiveGames();
  }, 60000);
}

async function start() {
  if (hasDatabase) {
    try {
      // Set a timeout for database initialization
      console.log('[Server] Initializing database...');
      const timeoutMs = isServerless ? 30000 : 15000;
      await Promise.race([
        initDatabase(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Database connection timeout after ${timeoutMs / 1000}s`)), timeoutMs)
        )
      ]);
      setDatabaseReady(true);
      console.log('[Server] Database initialized successfully');
    } catch (error) {
      setDatabaseReady(false);
      console.error('[Server] Database initialization failed:', error.message);
      if (!isServerless) {
        process.exit(1);
      }
    }
  } else {
    setDatabaseReady(false);
    console.warn('[Server] Skipping database initialization. DATABASE_URL (or POSTGRES_URL) is not set.');
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
