import dotenv from 'dotenv';
dotenv.config();

const splitOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// Explicit allowlist from FRONTEND_URLS (comma-separated) or FRONTEND_URL.
const configuredOrigins = splitOrigins(process.env.FRONTEND_URLS || process.env.FRONTEND_URL);

// Vercel routes the same deployment under several hostnames (project production
// URL, deployment URL, branch URL), so trust those same-deployment origins too.
// Vercel env vars contain a bare host (no scheme), so normalize to https://.
const sameDeploymentOrigins = splitOrigins(
  [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL].join(',')
).map((host) => (/^https?:\/\//.test(host) ? host : `https://${host}`));

const allowedOrigins = [...configuredOrigins, ...sameDeploymentOrigins];

function isAllowedOrigin(origin) {
  // Requests without an Origin header (curl, server-to-server) are never CORS
  // requests and must pass through unchanged.
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export const corsOptions = {
  origin(origin, callback) {
    // NEVER throw in this callback: cors forwards a callback error to Express,
    // which turns a disallowed CORS origin into a 500 "Internal server error".
    // Fail closed instead by reporting the origin as not allowed, so cors omits
    // the Access-Control-Allow-Origin header and the browser blocks the request
    // before it reaches our routes.
    if (!isAllowedOrigin(origin)) return callback(null, false);
    return callback(null, origin || true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};