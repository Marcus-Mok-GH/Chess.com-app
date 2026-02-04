import { Chess } from 'chess.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};

// Transposition table
const TT = new Map();
const TT_MAX = 500000;  // Increased from 100k
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

// Evaluation cache
const evalCache = new Map();
const EVAL_CACHE_MAX = 200000;  // Increased from 50k

// Killer moves (moves that caused beta cutoffs)
const killers = new Array(20).fill(null).map(() => [null, null]);

function idx(sq, white) {
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1]) - 1;
  return white ? (7 - r) * 8 + f : r * 8 + (7 - f);
}

function evaluate(game) {
  if (game.isCheckmate()) return game.turn() === 'w' ? -99999 : 99999;
  if (game.isDraw()) return 0;

  const fen = game.fen();
  const cached = evalCache.get(fen);
  if (cached !== undefined) return cached;

  let score = 0;
  const board = game.board();
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        const w = p.color === 'w';
        const sq = String.fromCharCode(97 + c) + (8 - r);
        const val = PIECE_VALUES[p.type] + PST[p.type][idx(sq, w)];
        score += w ? val : -val;
      }
    }
  }
  
  // Cache evaluation
  if (evalCache.size < EVAL_CACHE_MAX) {
    evalCache.set(fen, score);
  }
  
  return score;
}

function scoreMove(game, move, ply) {
  let s = 0;
  const m = game.move(move);
  
  // MVV-LVA for captures
  if (m.captured) s += 10000 + PIECE_VALUES[m.captured] * 10 - PIECE_VALUES[m.piece];
  
  // Promotions
  if (m.promotion) s += 9000 + PIECE_VALUES[m.promotion];
  
  // Check bonus
  if (game.inCheck()) s += 5000;
  
  // Killer move bonus
  if (killers[ply] && (killers[ply][0] === move || killers[ply][1] === move)) {
    s += 4000;
  }
  
  game.undo();
  return s;
}

function orderMoves(game, moves, ply = 0) {
  if (moves.length <= 1) return moves;
  const scored = moves.map(m => ({ m, s: scoreMove(game, m, ply) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.m);
}

function search(game, depth, alpha, beta, maximizing, ply = 0) {
  // Check time limit periodically (every 1000 nodes approx)
  if (ply === 0 || (ply % 3 === 0 && performance.now() - searchStartTime > TIME_LIMIT)) {
    if (performance.now() - searchStartTime > TIME_LIMIT) {
      timeExpired = true;
      return evaluate(game);
    }
  }
  
  const alphaOrig = alpha;
  const fen = game.fen();
  
  // Transposition table lookup
  const ttEntry = TT.get(fen);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) return ttEntry.value;
    if (ttEntry.flag === TT_LOWER) alpha = Math.max(alpha, ttEntry.value);
    else if (ttEntry.flag === TT_UPPER) beta = Math.min(beta, ttEntry.value);
    if (alpha >= beta) return ttEntry.value;
  }

  if (depth === 0 || game.isGameOver() || timeExpired) {
    return evaluate(game);
  }

  const moves = orderMoves(game, game.moves(), ply);
  let bestValue = maximizing ? -Infinity : Infinity;
  let bestMove = null;
  
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    game.move(move);
    
    let value;
    // Late Move Reductions: search later quiet moves with reduced depth
    if (i >= 4 && depth >= 3 && !game.inCheck()) {
      value = search(game, depth - 2, alpha, beta, !maximizing, ply + 1);
      // Re-search if it looks promising
      if (maximizing ? value > alpha : value < beta) {
        value = search(game, depth - 1, alpha, beta, !maximizing, ply + 1);
      }
    } else {
      value = search(game, depth - 1, alpha, beta, !maximizing, ply + 1);
    }
    
    game.undo();
    
    if (maximizing) {
      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
      alpha = Math.max(alpha, value);
    } else {
      if (value < bestValue) {
        bestValue = value;
        bestMove = move;
      }
      beta = Math.min(beta, value);
    }
    
    if (alpha >= beta) {
      // Store killer move
      if (ply < 20 && bestMove) {
        killers[ply][1] = killers[ply][0];
        killers[ply][0] = bestMove;
      }
      break;
    }
  }
  
  // Store in transposition table
  if (TT.size < TT_MAX) {
    let flag = TT_EXACT;
    if (bestValue <= alphaOrig) flag = TT_UPPER;
    else if (bestValue >= beta) flag = TT_LOWER;
    TT.set(fen, { value: bestValue, depth, flag });
  }
  
  return bestValue;
}

// Time limit for search (ms)
const TIME_LIMIT = 2000;
let searchStartTime = 0;
let timeExpired = false;

function findBestMove(fen, depth, bot, debug) {
  const startTime = performance.now();
  searchStartTime = startTime;
  timeExpired = false;
  
  const game = new Chess(fen);
  const moves = game.moves();
  
  if (moves.length === 0) return { bestMove: null, debugInfo: null };
  if (moves.length === 1) {
    const time = Math.round(performance.now() - startTime);
    return { 
      bestMove: moves[0], 
      debugInfo: debug ? { moves: [{ move: moves[0], value: 0 }], depth, time, bestMove: moves[0], progress: 1 } : null 
    };
  }

  // Clear old TT entries periodically
  if (TT.size > TT_MAX * 0.9) TT.clear();
  if (evalCache.size > EVAL_CACHE_MAX * 0.9) evalCache.clear();

  const isWhite = game.turn() === 'w';
  const ordered = orderMoves(game, moves, 0);
  const totalMoves = ordered.length;
  
  // Cap depth for faster response
  const effectiveDepth = Math.min(depth, 4);
  
  const scored = [];
  let lastUpdate = 0;
  
  for (let i = 0; i < ordered.length; i++) {
    // Check time limit
    if (performance.now() - startTime > TIME_LIMIT) {
      timeExpired = true;
      break;
    }
    
    const move = ordered[i];
    
    // Send progress update every 3 moves or 50ms to reduce overhead
    if (debug && (i % 3 === 0 || performance.now() - lastUpdate > 50)) {
      lastUpdate = performance.now();
      const currentTime = Math.round(performance.now() - startTime);
      self.postMessage({
        type: 'progress',
        debugInfo: {
          moves: [...scored].sort((a, b) => isWhite ? b.value - a.value : a.value - b.value),
          depth: effectiveDepth,
          time: currentTime,
          bestMove: scored.length > 0 ? scored.reduce((best, m) => 
            isWhite ? (m.value > best.value ? m : best) : (m.value < best.value ? m : best)
          ).move : null,
          current: move,
          progress: i / totalMoves,
          evaluating: `${i + 1}/${totalMoves}`,
        }
      });
    }
    
    game.move(move);
    const value = search(game, effectiveDepth - 1, -Infinity, Infinity, !isWhite, 1);
    game.undo();
    scored.push({ move, value });
  }

  // If we have no scored moves due to timeout, use the first legal move
  if (scored.length === 0) {
    scored.push({ move: ordered[0], value: 0 });
  }

  scored.sort((a, b) => isWhite ? b.value - a.value : a.value - b.value);

  const time = Math.round(performance.now() - startTime);
  const debugInfo = debug ? { 
    moves: scored, 
    depth: effectiveDepth, 
    time, 
    bestMove: scored[0].move, 
    current: null, 
    progress: 1,
    evaluating: 'done',
    ttSize: TT.size,
  } : null;

  if (!bot) return { bestMove: scored[0].move, debugInfo };

  const rand = Math.random();
  if (rand < bot.blunderChance && scored.length > 2) {
    const idx = Math.floor(scored.length * 0.6 + Math.random() * scored.length * 0.4);
    const chosen = scored[Math.min(idx, scored.length - 1)].move;
    if (debugInfo) debugInfo.bestMove = chosen;
    return { bestMove: chosen, debugInfo };
  }
  if (rand < bot.blunderChance + bot.missedTacticsChance && scored.length > 1) {
    const chosen = scored[Math.floor(Math.random() * Math.min(3, scored.length))].move;
    if (debugInfo) debugInfo.bestMove = chosen;
    return { bestMove: chosen, debugInfo };
  }
  return { bestMove: scored[0].move, debugInfo };
}

self.onmessage = function(e) {
  const { fen, depth, bot, debug } = e.data;
  const result = findBestMove(fen, depth, bot, debug);
  self.postMessage({ type: 'result', ...result });
};
