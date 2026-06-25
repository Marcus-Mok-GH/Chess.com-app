// Vercel serverless function handler.
//
// Routes all /api/* requests to the chess-server Express app.
// Socket.IO is NOT supported in serverless functions — point VITE_SOCKET_URL
// at a persistent server (Railway, Render, Replit, etc.) for real-time play.

import express from 'express';
import cors from 'cors';

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined,
  'http://localhost:5173',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(null, true); // permissive for now; tighten if needed
  },
  credentials: true,
}));

// ── Body parsing ───────────────────────────────────────────────────────────────
// Mount BEFORE all routes.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Route loading (lazy, once per cold start) ──────────────────────────────────
let routesReady = false;
let routesPromise = null;

function ensureRoutes() {
  if (routesReady) return Promise.resolve();
  if (routesPromise) return routesPromise;

  routesPromise = Promise.all([
    import('../artifacts/api-server/src/chess-server/routes/auth.js'),
    import('../artifacts/api-server/src/chess-server/routes/users.js'),
    import('../artifacts/api-server/src/chess-server/routes/games.js'),
    import('../artifacts/api-server/src/chess-server/routes/matchmaking.js'),
    import('../artifacts/api-server/src/chess-server/routes/coach.js'),
    import('../artifacts/api-server/src/chess-server/routes/engine.js'),
    import('../artifacts/api-server/src/chess-server/routes/stats.js'),
  ]).then(([auth, users, games, matchmaking, coach, engine, stats]) => {
    app.use('/api/auth', auth.default);
    app.use('/api/users', users.default);
    app.use('/api/games', games.default);
    app.use('/api/matchmaking', matchmaking.default);
    app.use('/api/coach', coach.default);
    app.use('/api/engine', engine.default);
    app.use('/api/stats', stats.default);
    routesReady = true;
    console.log('[vercel] Chess routes loaded');
  }).catch(err => {
    console.error('[vercel] Failed to load routes:', err);
    routesPromise = null; // reset so next request retries
    throw err;
  });

  return routesPromise;
}

// Kick off route loading + DB init immediately at cold start (non-blocking).
Promise.all([
  ensureRoutes(),
  import('../artifacts/api-server/src/chess-server/db/init.js')
    .then(({ initDatabase }) => initDatabase())
    .catch(err => console.warn('[vercel] DB init warning:', err?.message)),
]).catch(() => {/* errors surfaced per-request below */});

// ── Middleware: wait for routes before handling any request ────────────────────
app.use(async (_req, res, next) => {
  try {
    await ensureRoutes();
    next();
  } catch {
    res.status(503).json({ error: 'Server initializing — please retry in a moment.' });
  }
});

export default app;