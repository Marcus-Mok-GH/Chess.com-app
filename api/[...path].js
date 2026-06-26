// Vercel serverless function handler.
//
// Vercel invokes `api/[...path].js` with a Node (req, res) where the original
// URL has been stripped of the /api prefix. For example, a request to
//   /api/users/login  ->  req.url = "/users/login"
// We re-prepend /api before handing the request to Express so the routers
// mounted at /api/auth, /api/users, /api/games, etc. resolve correctly.

import express from 'express';
import cors from 'cors';

const app = express();

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
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
    routesPromise = null;
    throw err;
  });

  return routesPromise;
}

Promise.all([
  ensureRoutes(),
  import('../artifacts/api-server/src/chess-server/db/init.js')
    .then(({ initDatabase }) => initDatabase())
    .catch(err => console.warn('[vercel] DB init warning:', err?.message)),
]).catch(() => {});

app.use(async (_req, res, next) => {
  try {
    await ensureRoutes();
    next();
  } catch {
    res.status(503).json({ error: 'Server initializing — please retry in a moment.' });
  }
});

export default function handler(req, res) {
  const original = req.url || '/';
  if (!original.startsWith('/api')) {
    const qs = original.includes('?') ? original.slice(original.indexOf('?')) : '';
    req.url = '/api' + (original === '/' ? '/' : original) + qs;
    req.url = req.url.replace(/\/api\/api(\/|\?|$)/, '/api$1');
  }
  return app(req, res);
}
