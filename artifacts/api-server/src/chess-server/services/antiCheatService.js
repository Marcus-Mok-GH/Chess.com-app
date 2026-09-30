/**
 * Server-side ranked-game integrity analysis.
 * This creates review signals, not automatic bans.
 */
import { Chess } from 'chess.js';
import { query } from '../db.js';
import { isStockfishConfigured, runEngine } from './engineWorker.js';
import { buildTimingMetrics } from './fairPlayTelemetry.js';
import { CHEAT_CONFIRMED_NOTIFICATION, createNotifications } from './notificationService.js';
import { normalizeTimeControl } from './chessClock.js';

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
  if (!analyzedMoves) return { analyzedMoves: 0, accuracy: null, centipawnLoss: null, bestMoveRate: null, suspiciousScore: 0, flagged: false, timing: buildTimingMetrics(moves), signals: [] };
  const centipawnLoss = moves.reduce((sum, move) => sum + move.centipawnLoss, 0) / analyzedMoves;
  const bestMoveRate = moves.filter(move => move.isBestMove).length / analyzedMoves;
  const accuracy = clamp(100 - centipawnLoss * 0.35, 0, 100);
  const timing = buildTimingMetrics(moves);
  const engineSignal = analyzedMoves >= 12 && ((bestMoveRate >= 0.9 && centipawnLoss <= 25) || (bestMoveRate >= 0.82 && centipawnLoss <= 12));
  const consistencySignal = analyzedMoves >= 24 && bestMoveRate >= 0.94 && centipawnLoss <= 18;
  const timingSignal = timing.hasClientTelemetry && timing.observedMoves >= 8 && timing.fastMoveRate >= 0.75 && timing.medianThinkTimeMs <= 900;
  const signals = [
    engineSignal ? 'engine_correlation' : null,
    consistencySignal ? 'long_sample_consistency' : null,
    timingSignal ? 'rapid_response_pattern' : null,
  ].filter(Boolean);
  const suspiciousScore = Math.round(clamp(
    bestMoveRate * 60 + Math.max(0, 85 - centipawnLoss) * 0.4 + timing.suspiciousScore * 0.45,
    0,
    100,
  ));
  // A single high engine-correlation metric is a review signal, not a verdict.
  // Flag automatically only when a second independent signal agrees, or when a
  // long sample is exceptionally unlikely without assistance.
  const flagged = analyzedMoves >= 12 && (signals.length >= 2 || (engineSignal && analyzedMoves >= 40 && bestMoveRate >= 0.96 && centipawnLoss <= 10));
  return {
    analyzedMoves,
    accuracy: Number(accuracy.toFixed(2)),
    centipawnLoss: Number(centipawnLoss.toFixed(2)),
    bestMoveRate: Number(bestMoveRate.toFixed(4)),
    suspiciousScore,
    flagged,
    timing,
    signals,
  };
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
  const reviewStatus = flaggedPlayers.length ? 'flagged' : 'complete';
  await setReviewStatus(gameCode, reviewStatus, { analyzedMoves: whiteMoves.length + blackMoves.length, whiteAnalyzedMoves: white.analyzedMoves, blackAnalyzedMoves: black.analyzedMoves, whiteAccuracy: white.accuracy, blackAccuracy: black.accuracy, whiteCentipawnLoss: white.centipawnLoss, blackCentipawnLoss: black.centipawnLoss, whiteBestMoveRate: white.bestMoveRate, blackBestMoveRate: black.bestMoveRate, suspiciousScore, flaggedPlayers, analysisJson: { detectionVersion: 2, engineDepth: ENGINE_DEPTH, maxMoves: MAX_ANALYZED_MOVES, truncated: moveHistory.length > MAX_ANALYZED_MOVES, white, black, moves: [...whiteMoves, ...blackMoves] } });
  return { status: reviewStatus, gameCode, suspiciousScore, flaggedPlayers };
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
  const validStatuses = ['queued', 'running', 'complete', 'flagged', 'unavailable', 'invalid_replay'];
  if (status && validStatuses.includes(status)) {
    return (await query('SELECT * FROM game_integrity_reviews WHERE status = $1 ORDER BY suspicious_score DESC, updated_at DESC LIMIT $2', [status, safeLimit])).rows;
  }
  return (await query('SELECT * FROM game_integrity_reviews ORDER BY suspicious_score DESC, updated_at DESC LIMIT $1', [safeLimit])).rows;
}

// Human-readable name of the rating pool a game was played in. A missing time
// control (legacy rows) yields no label rather than pretending it was untimed.
const RATING_POOL_LABELS = Object.freeze({
  unlimited: 'Unlimited',
  bullet: 'Bullet',
  blitz: 'Blitz',
  blitz_3_2: 'Blitz',
  rapid: 'Rapid',
  rapid_10_3: 'Rapid',
  classical: 'Classical',
  classical_30_5: 'Classical',
});

function ratingContext(timeControl) {
  if (timeControl == null || !String(timeControl).trim()) return { normalized: null, label: null };
  const normalized = normalizeTimeControl(timeControl);
  return { normalized, label: RATING_POOL_LABELS[normalized] || 'Unlimited' };
}

// `Number(null)` is 0, which would invent an "Elo 0" for games recorded
// before ratings were captured. Anything absent stays absent.
function eloOf(side) {
  if (side.elo == null || side.elo === '') return null;
  const value = Number(side.elo);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function describeCheater(side, pool) {
  const name = side.name || 'Your opponent';
  const elo = eloOf(side);
  const bits = [];
  if (pool.label) bits.push(pool.label);
  if (elo != null) bits.push(`Elo ${elo}`);
  return bits.length ? `${name} (${bits.join(' · ')})` : name;
}

/**
 * Builds the inbox entries for a confirmed fair-play case: one for the
 * opponent who played the game and one for every other integrity reviewer,
 * each carrying the rating context and the game the cheating happened on.
 *
 * Returns the notifications it created (empty when the game is unknown or no
 * accused player can be identified — reviewers are only told about a case we
 * can actually attribute).
 */
export async function notifyCheatConfirmed(gameCode, { reviewerId = null } = {}) {
  const code = String(gameCode || '').trim().toUpperCase();
  if (!code) return [];
  const actingReviewer = reviewerId == null ? null : String(reviewerId);

  const result = await query(
    `SELECT g.game_code, g.white_player_id, g.black_player_id, g.white_player_name, g.black_player_name,
            g.result, g.time_control, g.white_elo, g.black_elo, r.flagged_players
       FROM games g
       LEFT JOIN game_integrity_reviews r ON r.game_code = g.game_code
      WHERE g.game_code = $1 LIMIT 1`,
    [code]
  );
  const game = result.rows[0];
  if (!game) return [];

  const sides = [
    { id: game.white_player_id, name: game.white_player_name, elo: game.white_elo },
    { id: game.black_player_id, name: game.black_player_name, elo: game.black_elo },
  ].filter((side) => side.id);

  // Prefer the analysis verdict; fall back to who the players reported so a
  // manually confirmed case still names an accused player.
  const accused = new Set((game.flagged_players || []).map(String));
  let cheaters = sides.filter((side) => accused.has(String(side.id)));
  if (!cheaters.length) {
    const reports = await query(
      'SELECT DISTINCT reported_player_id FROM fair_play_reports WHERE game_code = $1',
      [code]
    );
    const reported = new Set(reports.rows.map((row) => String(row.reported_player_id)));
    cheaters = sides.filter((side) => reported.has(String(side.id)));
  }
  if (!cheaters.length) return [];

  const cheaterIds = new Set(cheaters.map((side) => String(side.id)));
  const opponents = sides.filter((side) => !cheaterIds.has(String(side.id)));
  const pool = ratingContext(game.time_control);
  const summary = cheaters.map((side) => describeCheater(side, pool)).join(' and ');
  const payload = {
    gameCode: code,
    gameResult: game.result || null,
    timeControl: pool.normalized,
    ratingLabel: pool.label,
    cheaters: cheaters.map((side) => ({
      playerId: String(side.id),
      name: side.name || null,
      elo: eloOf(side),
    })),
    reviewerId: actingReviewer,
    link: `/review/${code}`,
  };

  // Whoever just pressed confirm already knows the outcome, so the notice goes
  // to the rest of the review team.
  const admins = [...reviewerIds()].filter((id) => id !== actingReviewer);
  // An automated or scripted confirmation has no reviewer to name, and
  // `String(null)` would put a literal "null" in front of an admin.
  const attribution = actingReviewer ? ` by reviewer ${actingReviewer}` : '';

  const notifications = [
    ...opponents.map((side) => ({
      recipientId: String(side.id),
      type: CHEAT_CONFIRMED_NOTIFICATION,
      gameCode: code,
      title: `Cheating confirmed in game ${code}`,
      body: `A fair-play review confirmed that ${summary} used engine assistance against you in ranked game ${code}.`,
      payload,
    })),
    ...admins.map((id) => ({
      recipientId: id,
      type: CHEAT_CONFIRMED_NOTIFICATION,
      gameCode: code,
      title: `Fair-play case confirmed — game ${code}`,
      body: `Game ${code}: ${summary} was confirmed as cheating${attribution}.`,
      payload,
    })),
  ];

  return createNotifications(notifications);
}

export async function recordIntegrityDecision(gameCode, { decision, reviewerId, note = null } = {}) {
  const allowed = new Set(['confirmed', 'cleared', 'needs_review']);
  if (!gameCode || !allowed.has(decision) || !reviewerId) return null;
  const result = await query(
    'UPDATE game_integrity_reviews SET review_decision = $2, reviewer_id = $3, review_note = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE game_code = $1 RETURNING *',
    [gameCode, decision, String(reviewerId), note ? String(note).slice(0, 2000) : null]
  );
  const review = result.rows[0] || null;
  // Notification delivery must never roll back a reviewer's decision: a failed
  // inbox write is logged, and the decision still stands.
  if (review && decision === 'confirmed') {
    try {
      await notifyCheatConfirmed(gameCode, { reviewerId });
    } catch (error) {
      console.error('[AntiCheat] Failed to notify confirmed case:', error.message);
    }
  }
  return review;
}
