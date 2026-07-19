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
//
// NOTE: The Express app mounts all routes at /api/... (e.g.
// app.use('/api/auth', ...)). Depending on the Vercel rewrite/runtime, a
// catch-all function can receive either the original URL (/api/auth/...) or the
// matched path with the function prefix removed (/auth/...). Normalize only
// known API route families so login endpoints are never hard-blocked by prefix
// drift without rewriting unrelated paths.

import app from '../artifacts/api-server/src/chess-server/index.js';
import { normalizeApiRequestUrl } from './normalize-path.js';

function handler(req, res) {
  req.url = normalizeApiRequestUrl(req.url);

  return app(req, res);
}

/**
 * Vercel serverless handler for `/api/*` requests.
 *
 * @param {import('http').IncomingMessage} req  Incoming HTTP request.
 * @param {import('http').ServerResponse}   res Outgoing HTTP response.
 * @returns {void}
 */
export default handler;
