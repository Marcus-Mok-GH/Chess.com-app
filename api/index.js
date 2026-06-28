import app from '../artifacts/api-server/src/chess-server/index.js';

export default function handler(req, res) {
  try {
    // If Vercel stripped the /api prefix, re-add it so Express routes match
    if (req.url && !req.url.startsWith('/api')) {
      req.url = '/api' + (req.url === '/' ? '' : req.url);
    }
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Handler Error]:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ 
      error: 'Internal Server Error', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }));
  }
}