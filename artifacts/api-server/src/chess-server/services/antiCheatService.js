/**
 * Server-side ranked-game integrity analysis.
 * This creates review signals, not automatic bans.
 */
import { Chess } from 'chess.js';
import { query } from '../db.js';
import { isStockfishConfigured, runEngine } from './engineWorker.js';

const MAX_ANALYZED_MOVES = 160;
const ENGINE_DEPTH = 8;
const ENGINE_TIMEOUT_MS = 2500;
const analysisQueue = [];
let queueRunning = false;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function parseStoredMove(entry) {
  if (entry && typeof entry === 'object') return entry;
  if (typeof entry !== 'string') return null;
  const value = entry.trim();
  if (!value) return null;
  if (value.startsWith('{') || value.startsWith('[')) {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function toUci(move) {
  if (!move || typeof move !== 'object' || !move.from || !move.to) return null;
  return String(move.from) + String(move.to) + (move.promotion || '');
}

function reviewerIds() {
  return new Set(String(process.env.CHESS_REVIEW_ADMIN_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
}

export function isIntegrityReviewer(userId) {
  return Boolean(userId) && reviewerIds().has(String(userId));
}

async function setReviewStatus(gameCode, status, fields = {}) {
  await query(
    'INSERT INTO game_integrity_reviews (game_code, status, error_message, analyzed_moves, white_analyzed_moves, black_analyzed_moves, white_accuracy, black_accuracy, white_centipawn_loss, black_centipawn_loss, white_best_move_rate, black_best_move_rate, suspicious_score, flagged_players, analysis_json, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP) ON CONFLICT (game_code) DO UPDATE SET status=EXCLUDED.status, error_message=EXCLUDED.error_message, analyzed_moves=EXCLUDED.analyzed_moves, white_analyzed_moves=EXCLUDED.white_analyzed_moves, black_analyzed_moves=EXCLUDED.black_analyzed_moves, white_accuracy=EXCLUDED.white_accuracy, black_accuracy=EXCLUDED.black_accuracy, white_centipawn_loss=EXCLUDED.white_centipawn_loss, black_centipawn_loss=EXCLUDED.black_centipawn_loss, white_best_move_rate=EXCLUDED.white_best_move_rate, black_best_move_rate=EXCLUDED.black_best_move_rate, suspicious_score=EXCLUDED.suspicious_score, flagged_players=EXCLUDED.flagged_players, analysis_json=EXCLUDED.analysis_json, updated_at=CURRENT_TIMESTAMP',
    [gameCode, status, fields.errorMessage || null, fields.analyzedMoves || 0, fields.whiteAnalyzedMoves || 0, fields.blackAnalyzedMoves || 0, fields.whiteAccuracy ?? null, fields.blackAccuracy ?? null, fields.whiteCentipawnLoss ?? null, fields.blackCentipawnLoss ?? null, fields.whiteBestMoveRate ?? null, fields.blackBestMoveRate ?? null, fields.suspiciousScore || 0, fields.flaggedPlayers || [], JSON.stringify(fields.analysisJson || {})]
  );
}

function playerMetrics(moves) {
  const analyzedMoves = moves.length;
  if (!analyzedMoves) return { analyzedMoves: 0, accuracy: null, centipawnLoss: null, bestMoveRate: null, suspiciousScore: 0, flagged: false };
  const centipawnLoss = moves.reduce((sum, move) => sum + move.centipawnLoss, 0) / analyzedMoves;
  const bestMoveRate = moves.filter(move => move.isBestMove).length / analyzedMoves;
  const accuracy = clamp(100 - centipawnLoss * 0.35, 0, 100);
  const suspiciousScore = Math.round(clamp(bestMoveRate * 60 + Math.max(0, 85 - centipawnLoss) * 0.4, 0, 100));
  const flagged = analyzedMoves >= 12 && ((bestMoveRate >= 0.9 && centipawnLoss <= 25) || (bestMoveRate >= 0.82 && centipawnLoss <= 12));
  return { analyzedMoves, accuracy: Number(accuracy.toFixed(2)), centipawnLoss: Number(centipawnLoss.toFixed(2)), bestMoveRate: Number(bestMoveRate.toFixed(4)), suspiciousScore, flagged };
}

export async function analyzeRankedGame(gameCode) {
  const result = await query('SELECT game_code, white_player_id, black_player_id, game_mode, status, move_history FROM games WHERE game_code = $1 LIMIT 1', [gameCode]);
  const game = result.rows[0];
  if (!game || game.game_mode !== 'ranked' || game.status !== 'completed') return null;
  if (!isStockfishConfigured()) {
    await setReviewStatus(gameCode, 'unavailable', { errorMessage: 'Stockfish is not configured.' });
    return { status: 'unavailable', gameCode };
  }
  await setReviewStatus(gameCode, 'running');
  const chess = new Chess();
  const whiteMoves = [];
  const blackMoves = [];
  const moveHistory = Array.isArray(game.move_history) ? game.move_history : [];
  try {
    for (const entry of moveHistory.slice(0, MAX_ANALYZED_MOVES)) {
      const stored = parseStoredMove(entry);
      const beforeFen = chess.fen();
      const applied = chess.move(stored);
      if (!applied) throw new Error('Stored move could not be replayed.');
      const actualUci = toUci(applied);
      const engine = await runEngine(beforeFen, { depth: ENGINE_DEPTH, multiPv: 3, timeoutMs: ENGINE_TIMEOUT_MS });
      const candidates = Array.isArray(engine.candidates) ? engine.candidates : [];
      const bestScore = candidates.length ? Math.max(...candidates.map(candidate => Number(candidate.score) || 0)) : 0;
      const played = candidates.find(candidate => candidate.move === actualUci);
      const playedScore = played ? Number(played.score) || 0 : bestScore - 120;
      const moveAnalysis = { ply: whiteMoves.length + blackMoves.length + 1, color: applied.color === 'w' ? 'white' : 'black', move: actualUci, bestMove: engine.bestMove || null, isBestMove: engine.bestMove === actualUci, centipawnLoss: clamp(Math.round(bestScore - playedScore), 0, 1000), candidateRank: played ? candidates.filter(candidate => (Number(candidate.score) || 0) > playedScore).length + 1 : null };
      (applied.color === 'w' ? whiteMoves : blackMoves).push(moveAnalysis);
    }
  } catch (error) {
    await setReviewStatus(gameCode, 'invalid_replay', { errorMessage: error.message });
    return { status: 'invalid_replay', gameCode };
  }
  const white = playerMetrics(whiteMoves);
  const black = playerMetrics(blackMoves);
  const flaggedPlayers = [];
  if (white.flagged && game.white_player_id) flaggedPlayers.push(String(game.white_player_id));
  if (black.flagged && game.black_player_id) flaggedPlayers.push(String(game.black_player_id));
  const suspiciousScore = Math.max(white.suspiciousScore, black.suspiciousScore);
  await setReviewStatus(gameCode, 'complete', { analyzedMoves: whiteMoves.length + blackMoves.length, whiteAnalyzedMoves: white.analyzedMoves, blackAnalyzedMoves: black.analyzedMoves, whiteAccuracy: white.accuracy, blackAccuracy: black.accuracy, whiteCentipawnLoss: white.centipawnLoss, blackCentipawnLoss: black.centipawnLoss, whiteBestMoveRate: white.bestMoveRate, blackBestMoveRate: black.bestMoveRate, suspiciousScore, flaggedPlayers, analysisJson: { engineDepth: ENGINE_DEPTH, maxMoves: MAX_ANALYZED_MOVES, truncated: moveHistory.length > MAX_ANALYZED_MOVES, white, black, moves: [...whiteMoves, ...blackMoves] } });
  return { status: 'complete', gameCode, suspiciousScore, flaggedPlayers };
}

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (analysisQueue.length) {
    const gameCode = analysisQueue.shift();
    try { await analyzeRankedGame(gameCode); } catch (error) { console.error('[AntiCheat] Analysis failed:', error.message); }
  }
  queueRunning = false;
}

export function scheduleGameAnalysis(gameCode) {
  if (!gameCode || analysisQueue.includes(gameCode)) return;
  analysisQueue.push(String(gameCode));
  void drainQueue();
}

export async function getIntegrityReviews({ status = null, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
  if (status && ['queued', 'running', 'complete', 'flagged', 'unavailable', 'invalid_replay'].includes(status)) {
    return (await query('SELECT * FROM game_integrity_reviews WHERE status = $1 ORDER BY suspicious_score DESC, updated_at DESC LIMIT $2', [status, safeLimit])).rows;
  }
  return (await query('SELECT * FROM game_integrity_reviews ORDER BY suspicious_score DESC, updated_at DESC LIMIT $1', [safeLimit])).rows;
}
