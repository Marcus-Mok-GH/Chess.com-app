import { Chess } from 'chess.js';

let engine = null;
let engineReady = false;
let pendingCallback = null;
let collectedMoves = [];
let pendingAnalysis = null;
let lastInfo = null;

function initEngine() {
  if (engine) return Promise.resolve(engine);
  
  return new Promise((resolve) => {
    // Load stockfish from public folder as a web worker
    const wasmSupported = typeof WebAssembly === 'object' && 
      WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
    
    const stockfishPath = wasmSupported ? '/stockfish.wasm.js' : '/stockfish.js';
    engine = new Worker(stockfishPath);
    
    engine.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      
      // Engine is ready
      if (line === 'uciok') {
        engineReady = true;
        resolve(engine);
        return;
      }
      
      if (line.includes(' pv ')) {
        const depthMatch = line.match(/depth (\d+)/);
        const scoreMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)(?:\s.*)?/);

        if (pvMatch) {
          const move = pvMatch[1];
          let score = 0;
          let mate = null;
          if (scoreMatch) {
            score = parseInt(scoreMatch[1]);
          } else if (mateMatch) {
            mate = parseInt(mateMatch[1]);
            score = mate > 0 ? 100000 : -100000;
          }
          const depth = depthMatch ? parseInt(depthMatch[1]) : 0;

          if (!lastInfo || depth >= lastInfo.depth) {
            lastInfo = {
              depth,
              score,
              mate,
              pv: line.split(' pv ')[1] || ''
            };
          }

          if (!pendingAnalysis) {
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
      }
      
      if (line.startsWith('bestmove')) {
        const match = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
        if (!match) return;

        const bestMove = match[1];

        if (pendingAnalysis) {
          pendingAnalysis({
            bestMove,
            score: lastInfo?.score ?? 0,
            mate: lastInfo?.mate ?? null,
            depth: lastInfo?.depth ?? 0,
            pv: lastInfo?.pv ?? ''
          });
          pendingAnalysis = null;
          return;
        }

        if (pendingCallback) {
          if (!collectedMoves.find(m => m.move === bestMove)) {
            collectedMoves.unshift({ move: bestMove, score: 0, depth: 0 });
          }
          pendingCallback(bestMove, collectedMoves);
          pendingCallback = null;
        }
      }
    };
    
    engine.onerror = (err) => {
      console.error('Stockfish error:', err);
    };
    
    // Initialize UCI protocol
    engine.postMessage('uci');
  });
}

function getSearchParams(bot) {
  // Scale search based on bot strength
  const nodes = bot.nodes || 10000;
  const depth = bot.depth || 10;
  
  // For weaker bots, use node limit; for stronger bots use depth
  if (nodes < 5000) {
    return `go nodes ${nodes}`;
  } else if (nodes < 50000) {
    return `go movetime ${Math.min(nodes / 10, 1000)}`;
  } else {
    return `go depth ${Math.min(depth + 2, 15)}`;
  }
}

function selectMove(bestMove, candidates, bot, game) {
  // Make sure we have valid candidates
  if (!candidates || candidates.length === 0) {
    return bestMove;
  }

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);

  // For weaker bots, sometimes pick a suboptimal move
  const rand = Math.random();

  if (bot.blunderChance && rand < bot.blunderChance && candidates.length > 2) {
    // Pick a bad move (from bottom 40%)
    const badMoves = candidates.slice(Math.floor(candidates.length * 0.6));
    if (badMoves.length > 0) {
      return badMoves[Math.floor(Math.random() * badMoves.length)].move;
    }
  }

  if (bot.missedTacticsChance && rand < bot.blunderChance + bot.missedTacticsChance && candidates.length > 1) {
    // Pick a decent but not best move (top 3-5)
    const okMoves = candidates.slice(0, Math.min(5, candidates.length));
    if (okMoves.length > 0) {
      return okMoves[Math.floor(Math.random() * okMoves.length)].move;
    }
  }

  // Apply personality-based selection for intermediate bots
  if (bot.playStyle && candidates.length > 1) {
    const dynamicAggression = getDynamicAggression(bot, candidates);
    const scored = candidates.map(c => {
      let bonus = 0;
      const m = c.move;

      try {
        const tempGame = new Chess(game.fen());
        const moveObj = tempGame.move(m);

        if (moveObj) {
          // Aggressive bots prefer captures and checks
          if (dynamicAggression) {
            if (moveObj.captured) bonus += dynamicAggression * 20;
            if (tempGame.inCheck()) bonus += dynamicAggression * 15;
          }

          // Queen-active bots prefer queen moves
          if (bot.playStyle.queenActivity && moveObj.piece === 'q') {
            bonus += bot.playStyle.queenActivity * 25;
          }

          // Center control
          if (bot.playStyle.favorsCenter) {
            const centerSquares = ['d4', 'd5', 'e4', 'e5'];
            if (centerSquares.includes(moveObj.to)) {
              bonus += bot.playStyle.favorsCenter * 15;
            }
          }
        }
      } catch (e) {
        // Ignore invalid moves
      }

      return { ...c, adjustedScore: c.score + bonus };
    });

    scored.sort((a, b) => b.adjustedScore - a.adjustedScore);

    // Sometimes pick from top 3 instead of absolute best
    if (Math.random() < 0.3 && scored.length > 1) {
      const topMoves = scored.slice(0, Math.min(3, scored.length));
      if (topMoves.length > 0) {
        return topMoves[Math.floor(Math.random() * topMoves.length)].move;
      }
    }

    return scored[0].move;
  }

  return bestMove;
}

function getDynamicAggression(bot, candidates) {
  const baseAggression = bot.playStyle?.aggression ?? 0;
  if (!bot.playStyle?.adaptive) {
    return baseAggression;
  }

  const bestScore = candidates[0]?.score ?? 0;

  if (bestScore <= -80) {
    return Math.min(baseAggression + 0.35, 1);
  }

  if (bestScore >= 80) {
    return Math.max(baseAggression - 0.35, 0);
  }

  return baseAggression;
}

async function findBestMove(fen, bot, debug) {
  const startTime = performance.now();
  const game = new Chess(fen);
  
  await initEngine();
  
  // Reset state
  collectedMoves = [];
  
  return new Promise((resolve) => {
    pendingCallback = (bestMove, candidates) => {
      const time = Math.round(performance.now() - startTime);
      const selectedMove = selectMove(bestMove, candidates, bot, game);
      
      resolve({
        type: 'result',
        bestMove: selectedMove,
        debugInfo: debug ? {
          time,
          candidates: candidates.length,
          engineBest: bestMove,
          selected: selectedMove,
          bot: bot.name,
        } : null
      });
    };
    
    // Configure engine
    engine.postMessage('ucinewgame');
    engine.postMessage(`position fen ${fen}`);
    
    // Set MultiPV for getting multiple candidate moves
    const multiPV = Math.min(5, game.moves().length);
    engine.postMessage(`setoption name MultiPV value ${multiPV}`);
    
    // Start search
    engine.postMessage(getSearchParams(bot));
  });
}

async function analyzePosition(fen, depth = 12) {
  await initEngine();
  lastInfo = null;

  return new Promise((resolve) => {
    pendingAnalysis = (result) => {
      resolve({ type: 'analysis', ...result });
    };

    engine.postMessage('ucinewgame');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage('setoption name MultiPV value 1');
    engine.postMessage(`go depth ${Math.min(Math.max(depth, 6), 18)}`);
  });
}

// Flag to prevent concurrent searches
let isSearching = false;

// Web Worker message handler
self.onmessage = async function(e) {
  const { fen, bot, debug, action, depth } = e.data;

  // Skip if already searching to prevent conflicts
  if (isSearching) {
    console.warn('Skipping AI move request - already processing');
    return;
  }

  isSearching = true;

  try {
    if (action === 'analyze') {
      const result = await analyzePosition(fen, depth);
      self.postMessage(result);
    } else {
      const result = await findBestMove(fen, bot, debug);
      self.postMessage(result);
    }
  } catch (err) {
    console.error('Worker error:', err);
    if (action === 'analyze') {
      self.postMessage({ type: 'analysis', bestMove: null, score: 0, mate: null, depth: 0, pv: '', error: true });
    } else {
      const game = new Chess(fen);
      const moves = game.moves();
      if (moves.length > 0) {
        self.postMessage({
          type: 'result',
          bestMove: moves[Math.floor(Math.random() * moves.length)],
          debugInfo: debug ? { error: err.message } : null
        });
      }
    }
  } finally {
    isSearching = false;
  }
};
