import { Router } from 'express';
import stockfish from 'stockfish';
import { Chess } from 'chess.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = Router();

// Configurable timeout with buffer for serverless environments
const getFunctionTimeoutMs = () => {
  const envTimeout = parseInt(process.env.FUNCTION_TIMEOUT_MS, 10);
  if (!isNaN(envTimeout) && envTimeout > 0) {
    // Reserve 20% buffer to respond before platform timeout
    return Math.max(Math.floor(envTimeout * 0.8), 5000);
  }
  return 5000; // Safe default
};

const TIMEOUT_MS = getFunctionTimeoutMs();

function isValidFen(fen) {
  if (!fen || typeof fen !== 'string') return false;
  try {
    const chess = new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

router.post('/move', async (req, res) => {
  let engine = null;
  try {
    const { fen, bot, debug } = req.body;
    if (!fen) return errorResponse(res, 400, 'Missing required field: fen');
    if (!isValidFen(fen)) return errorResponse(res, 400, 'Invalid FEN string');

    const collectedMoves = [];
    const getSearchParams = (bot) => {
      if (!bot) return 'go depth 10';

      // Coerce and validate nodes parameter
      let nodes = Number(bot.nodes);
      if (isNaN(nodes) || nodes < 0) nodes = 10000;
      nodes = Math.min(nodes, 1000000); // Upper limit

      // Coerce and validate depth parameter
      let depth = Number(bot.depth);
      if (isNaN(depth) || depth < 1) depth = 10;
      depth = Math.min(depth, 20); // Upper limit

      if (nodes < 5000) return `go nodes ${nodes}`;
      if (nodes < 50000) return `go movetime ${Math.min(nodes / 10, 1000)}`;
      return `go depth ${Math.min(depth, 12)}`;
    };

    const searchParams = getSearchParams(bot);

    const result = await new Promise((resolve, reject) => {
      let resolved = false;

      const hardAbortTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (engine) {
            try { engine.terminate(); } catch(e) {}
          }
          reject(new Error('Search timed out'));
        }
      }, TIMEOUT_MS);

      stockfish().then(eng => {
        // Check if already resolved (timed out)
        if (resolved) {
          try { eng.terminate(); } catch(e) {}
          return;
        }
        engine = eng;

        eng.onmessage = (line) => {
          const trimmed = String(line).trim();
          if (debug) console.log('[Stockfish Output]', trimmed);

          if (trimmed.includes(' pv ')) {
            const pvMatch = trimmed.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
            if (pvMatch) {
              const move = pvMatch[1];
              const depthMatch = trimmed.match(/depth (\d+)/);
              const scoreMatch = trimmed.match(/score cp (-?\d+)/);
              const mateMatch = trimmed.match(/score mate (-?\d+)/);

              const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
              let score = 0;
              if (scoreMatch) score = parseInt(scoreMatch[1], 10);
              else if (mateMatch) score = parseInt(mateMatch[1], 10) > 0 ? 100000 : -100000;

              const existing = collectedMoves.find(m => m.move === move);
              if (existing) {
                if (depth >= existing.depth) {
                  existing.score = score;
                  existing.depth = depth;
                }
              } else {
                collectedMoves.push({ move, score, depth });
              }
            }
          }

          if (trimmed.startsWith('bestmove')) {
            if (!resolved) {
              resolved = true;
              clearTimeout(hardAbortTimeout);
              const match = trimmed.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
              if (match) {
                resolve({ bestMove: match[1], candidates: collectedMoves });
              } else {
                reject(new Error('No bestmove found in output: ' + trimmed));
              }
            }
          }
        };

        eng.postMessage('setoption name Hash value 16');
        eng.postMessage('setoption name Threads value 1');
        if (bot && bot.playStyle) {
          const skillLevel = Math.floor((bot.depth || 1) * 3.33);
          eng.postMessage(`setoption name Skill Level value ${Math.min(20, skillLevel)}`);
        }
        eng.postMessage('uci');
        eng.postMessage('ucinewgame');
        eng.postMessage(`position fen ${fen}`);
        eng.postMessage(searchParams);
      }).catch(err => {
        if (!resolved) {
          resolved = true;
          clearTimeout(hardAbortTimeout);
          reject(err);
        }
      });
    });

    if (engine) {
      try { engine.terminate(); } catch(e) {}
    }

    res.json({
      type: 'result',
      ...result,
      debugInfo: debug ? { fen, searchParams, botName: bot?.name } : null
    });

  } catch (error) {
    if (engine) {
      try { engine.terminate(); } catch(e) {}
    }
    console.error('[Engine] Move error:', error);
    return handleRouteError(res, error, 'Failed to calculate move');
  }
});

export default router;
