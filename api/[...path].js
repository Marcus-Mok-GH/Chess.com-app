// Vercel serverless entry point.
//
// The Express app lives inside the `artifacts/api-server` workspace package
// (`artifacts/api-server/src/chess-server/index.js`). Vercel's catch-all route
// (`api/[...path].js`) re-exports it as the default handler so any `/api/*`
// request is satisfied by this single Node 24 serverless function.
//
// Vercel invokes a Node function by calling `handler(req, res)` where the
// handler is the default export — which here is the Express app. Express is
// itself a request handler, so this passes through unchanged.

import app from '../artifacts/api-server/src/chess-server/index.js';

// Vercel invokes this handler with the ORIGINAL URL (e.g. `/api/auth/sign-in/email-otp`).
// The Express app inside `chess-server/index.js` mounts its routes under
// `/api/...`, so we MUST strip the `/api` prefix before Express sees the
// request — otherwise `/api/auth/...` won't match `app.use('/api/auth', ...)`.
//
// In standalone mode (Vercel env unset) the same Express app listens on
// PORT directly, in which case incoming URLs already have the `/api/...`
// prefix and we must NOT strip it. So the strip is gated on Vercel.

const isVercel = !!process.env.VERCEL;

function handler(req, res) {
  if (isVercel && typeof req.url === 'string' && req.url.startsWith('/api')) {
    // Strip the leading `/api` (with or without trailing slash) so Express
    // routes like `/api/auth/...` and `/api/matchmaking/...` still match.
    const stripped = req.url.replace(/^\/api(?=\/|$)/, '') || '/';
    req.url = stripped;
  }
  return app(req, res);
}

/**
 * Vercel serverless handler for `/api/*` requests.
 *
 * Vercel invokes this as `handler(req, res)`. The Express app returned from
 * `chess-server/index.js` is itself a `(req, res, next)` request handler, so
 * passing it through unchanged satisfies every `/api/*` route in one
 * serverless function.
 *
 * @param {import('http').IncomingMessage} req  Incoming HTTP request.
 * @param {import('http').ServerResponse}   res Outgoing HTTP response.
 * @returns {void}
 */
export default handler;