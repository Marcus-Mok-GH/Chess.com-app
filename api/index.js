import app from '../artifacts/api-server/src/chess-server/index.js';

export default function handler(req, res) {
  // If Vercel stripped the /api prefix, re-add it so Express routes match
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url === '/' ? '' : req.url);
  }
  return app(req, res);
}
