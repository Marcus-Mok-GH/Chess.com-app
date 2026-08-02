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
export default app;