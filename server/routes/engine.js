import { Router } from 'express';
import stockfish from 'stockfish';
import { Chess } from 'chess.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = Router();

// Configurable timeout with buffer for serverless environments
const getFunctionTimeoutMs = () => {
  // Vercel's default is usually 10-15s, but we should be safe.
  // If FUNCTION_TIMEOUT_MS is set (e.g. 12000), we use it with a buffer.
  const envTimeout = parseInt(process.env.FUNCTION_TIMEOUT_MS, 10);
  if (!isNaN(envTimeout) && envTimeout > 0) {
    // Reserve 1.5s buffer to respond before platform timeout
    const buffered = envTimeout - 1500;
    return Math.max(buffered, 1000);
  }
  return 10000; // 10s default is better than 5s for Stockfish cold starts
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

    const result = await new Promise(async (resolve, reject) => {
      let resolved = false;

      const hardAbortTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (engine) {
            try {
              if (debug || process.env.VERCEL) console.log('[Engine] Terminating engine due to timeout');
              engine.terminate();
            } catch(e) {}
          }
          reject(new Error(`Search timed out after ${TIMEOUT_MS}ms`));
        }
      }, TIMEOUT_MS);

      // Use lite-single variant in serverless (no SharedArrayBuffer, faster cold start)
      const engineVariant = process.env.VERCEL ? 'lite-single' : undefined;
      if (debug || process.env.VERCEL) console.log(`[Engine] Initializing Stockfish (${engineVariant || 'default'})...`);

      try {
        let eng;
        try {
          eng = await stockfish(engineVariant);
        } catch (initialError) {
          // If we encounter the "INIT_ENGINE is not a function" bug, it's likely due to
          // Stockfish's internal module caching. In a serverless environment, we may need
          // to fallback or retry without the variant if it fails.
          if (debug || process.env.VERCEL) console.warn('[Engine] Initial stockfish() call failed, retrying...', initialError.message);

          try {
            eng = await stockfish(); // Try default variant
          } catch (retryError) {
            // Last resort: If even the retry fails (e.g. Memory object error),
            // we should throw a more descriptive error.
            console.error('[Engine] Critical Stockfish initialization failure:', retryError);
            throw retryError;
          }
        }

        // Check if already resolved (timed out)
        if (resolved) {
          if (debug || process.env.VERCEL) console.log('[Engine] Engine initialized but request already timed out/resolved');
          try { eng.terminate(); } catch(e) {}
          return;
        }
        engine = eng;

        // Shim for different Stockfish API versions in Node.js
        const sendCommand = (cmd) => {
          if (typeof eng.postMessage === 'function') {
            eng.postMessage(cmd);
          } else if (typeof eng.sendCommand === 'function') {
            eng.sendCommand(cmd);
          } else {
            console.error('[Engine] No command method found on engine object');
          }
        };

        const handleMessage = (line) => {
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
                if (debug || process.env.VERCEL) console.log('[Engine] Found bestmove:', match[1]);
                resolve({ bestMove: match[1], candidates: collectedMoves });
              } else {
                reject(new Error('No bestmove found in output: ' + trimmed));
              }
            }
          }
        };

        // Attach message handler based on API version
        if (typeof eng.onmessage !== 'undefined' || 'onmessage' in eng) {
          eng.onmessage = handleMessage;
        } else {
          // Some versions use 'print' for output
          eng.print = handleMessage;
          eng.printErr = (err) => console.error('[Stockfish Error]', err);
        }

        sendCommand('setoption name Hash value 16');
        sendCommand('setoption name Threads value 1');
        if (bot && bot.playStyle) {
          let safeDepth = Number(bot.depth);
          if (isNaN(safeDepth) || safeDepth < 1) safeDepth = 1;
          safeDepth = Math.min(safeDepth, 20);
          const skillLevel = Math.floor((safeDepth || 1) * 3.33);
          sendCommand(`setoption name Skill Level value ${Math.min(20, skillLevel)}`);
        }
        sendCommand('uci');
        sendCommand('ucinewgame');
        sendCommand(`position fen ${fen}`);
        if (debug || process.env.VERCEL) console.log('[Engine] Sending search command:', searchParams);
        sendCommand(searchParams);
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(hardAbortTimeout);
          reject(err);
        }
      }
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
