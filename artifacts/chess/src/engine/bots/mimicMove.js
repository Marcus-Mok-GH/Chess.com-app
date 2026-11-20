/**
 * Copycat logic for the Mimic personality.
 *
 * Mimic plays in two phases, both derived purely from the FEN and the SAN
 * history, so undo/redo and restored games stay consistent:
 *
 *  - Mirror phase (default): it copies the user's last move, mirrored onto
 *    its own half of the board (rank r becomes 9 - r, file unchanged).
 *    Castles, en passant and promotions mirror naturally because the
 *    mirrored UCI lands on the equivalent square. When the exact mirror is
 *    illegal it plays the closest legal move with the same piece type, and
 *    when even that is impossible the engine's best move stands.
 *
 *  - Style phase: once Mimic has ever been down at least
 *    MIMIC_DEFEIT_THRESHOLD points of material (eight), the copying stops
 *    for good. It then profiles the user's play from the whole history
 *    (favorite piece, capture/check/pawn ratios, preferred zone) and plays
 *    the engine's top candidate that best matches that style, staying
 *    within MAX_STYLE_LOSS_CP of the engine's best move so it still plays
 *    for the win.
 *
 * Everything here is pure: the same FEN, candidate list and history always
 * produce the same pick.
 */

import { Chess } from 'chess.js';
import { applyUciMove } from './brilliantMove.js';
import { positionKey } from './stallMove.js';

/** Points of material Mimic must be down before it switches to the style phase. */
export const MIMIC_DEFEIT_THRESHOLD = 8;

/** Root moves scored for Mimic's style hunt. */
export const MIMIC_MULTIPV = 8;

/** How far below the engine's best a style-matched move may sit. */
export const MAX_STYLE_LOSS_CP = 200;

/** Chess material points, for pricing the deficit and captures. */
export const PIECE_POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const FILE_INDEX = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };

function sideToMoveOf(fen) {
  const turn = String(fen || '').trim().split(/\s+/)[1];
  return turn === 'b' ? 'b' : 'w';
}

/** Mirror a square across the horizontal midline: rank r becomes 9 - r. */
export function mirrorSquare(square) {
  return String(square || '').slice(0, 1) + String(9 - Number(String(square || '')[1]));
}

/**
 * Material on the board now, from the given side's point of view
 * (its points minus the opponent's).
 */
export function currentMaterialBalance(fen, side) {
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return 0;
  }
  let balance = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const points = PIECE_POINTS[piece.type] ?? 0;
      balance += piece.color === side ? points : -points;
    }
  }
  return balance;
}

/**
 * The lowest running material balance (bot minus opponent, in points)
 * reached across a full replay of the SAN history from the start
 * position. Returns null when the history cannot be replayed onto the
 * FEN, so the caller can fall back to the material currently on the board.
 */
export function minReplayedBalance(fen, history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  if (history.some((entry) => typeof entry !== 'string' || !entry)) return null;
  let chess;
  try {
    chess = new Chess();
  } catch {
    return null;
  }
  const bot = sideToMoveOf(fen);
  let balance = 0;
  let minimum = 0;
  for (const san of history) {
    let applied;
    try {
      applied = chess.move(san);
    } catch {
      return null;
    }
    if (!applied) return null;
    if (applied.captured) balance += (applied.color === bot ? 1 : -1) * (PIECE_POINTS[applied.captured] ?? 0);
    if (applied.promotion) {
      balance += (applied.color === bot ? 1 : -1) * ((PIECE_POINTS[applied.promotion] ?? 0) - 1);
    }
    minimum = Math.min(minimum, balance);
  }
  if (positionKey(chess.fen()) !== positionKey(fen)) return null;
  return minimum;
}

/**
 * Which phase Mimic is in: 'style' once it has ever been down at least
 * MIMIC_DEFEIT_THRESHOLD points, 'mirror' otherwise. The deficit check is
 * monotonic (based on the whole replayed history, not just the current
 * board), so Mimic never switches back to copying once it has fallen
 * behind.
 */
export function mimicPhase(fen, history = []) {
  const replayed = minReplayedBalance(fen, history);
  if (replayed !== null) {
    return replayed <= -MIMIC_DEFEIT_THRESHOLD ? 'style' : 'mirror';
  }
  // The history does not replay onto this FEN: judge by the material that
  // is on the board right now.
  return currentMaterialBalance(fen, sideToMoveOf(fen)) <= -MIMIC_DEFEIT_THRESHOLD ? 'style' : 'mirror';
}

function squareDistance(from, to) {
  return Math.abs((FILE_INDEX[from[0]] ?? 0) - (FILE_INDEX[to[0]] ?? 0)) + Math.abs(Number(from[1]) - Number(to[1]));
}

/**
 * Copy the user's last move onto the bot's own half of the board.
 *
 * Returns `{ uci, mirrorOf, exact, piece }` or null when there is no user
 * move to copy. `exact` is true for a clean mirror and false when the
 * closest legal move with the same piece type had to stand in.
 */
export function mirrorOfLastUserMove(fen, history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;
  if (history.some((entry) => typeof entry !== 'string' || !entry)) return null;
  let chess;
  try {
    chess = new Chess();
  } catch {
    return null;
  }
  let last = null;
  for (const san of history) {
    let applied;
    try {
      applied = chess.move(san);
    } catch {
      return null;
    }
    if (!applied) return null;
    last = applied;
  }

  const botColor = sideToMoveOf(fen);
  const userColor = botColor === 'w' ? 'b' : 'w';
  if (last.color !== userColor) return null; // the history does not end on a user move

  let target;
  try {
    target = new Chess(fen);
  } catch {
    return null;
  }

  const mirrorUci = mirrorSquare(last.from) + mirrorSquare(last.to) + (last.promotion || '');
  if (applyUciMove(target, mirrorUci)) {
    return { uci: mirrorUci, mirrorOf: last.san, exact: true, piece: last.piece };
  }

  // The exact mirror is illegal: closest legal move with the same piece
  // type, preferring the mirrored origin square, the nearest target square
  // and the quietest move, so the pick stays deterministic.
  const legal = target.moves({ verbose: true });
  if (legal.length === 0) return null;
  const sameType = legal.filter((move) => move.piece === last.piece);
  const pool = sameType.length > 0 ? sameType : legal;
  const origin = mirrorSquare(last.from);
  const destination = mirrorSquare(last.to);
  let best = null;
  let bestKey = null;
  for (const move of pool) {
    const key = [
      move.from === origin ? 1 : 0,
      -squareDistance(move.to, destination),
      move.captured ? 0 : 1,
      move.san,
    ];
    if (!bestKey || compareKeys(key, bestKey) > 0) {
      bestKey = key;
      best = move;
    }
  }
  if (!best) return null;
  return { uci: best.from + best.to + (best.promotion || ''), mirrorOf: last.san, exact: false, piece: last.piece };
}

function compareKeys(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

/**
 * Profile the user's play from the SAN history: piece usage, capture and
 * check ratios, pawn activity and the zone (own half / center / enemy
 * half) the user likes to operate in.
 */
export function userStyleProfile(history, userColor) {
  const empty = {
    total: 0,
    pieceCounts: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    captures: 0,
    checks: 0,
    zones: { own: 0, center: 0, enemy: 0 },
    captureRatio: 0,
    checkRatio: 0,
    pawnRatio: 0,
    favoritePiece: 'p',
    favoriteZone: 'center',
  };
  if (!Array.isArray(history) || history.length === 0 || !userColor) return empty;
  let chess;
  try {
    chess = new Chess();
  } catch {
    return empty;
  }
  const profile = { ...empty, pieceCounts: { ...empty.pieceCounts }, zones: { ...empty.zones } };
  for (const san of history) {
    let applied;
    try {
      applied = chess.move(san);
    } catch {
      break;
    }
    if (!applied) break;
    if (applied.color !== userColor) continue;
    profile.total += 1;
    profile.pieceCounts[applied.piece] = (profile.pieceCounts[applied.piece] ?? 0) + 1;
    if (applied.captured) profile.captures += 1;
    if (applied.san.includes('+') || applied.san.endsWith('#')) profile.checks += 1;
    const rank = Number(applied.to[1]);
    const relative = userColor === 'w' ? rank : 9 - rank; // 1..3 own, 4..5 center, 6..8 enemy
    if (relative <= 3) profile.zones.own += 1;
    else if (relative <= 5) profile.zones.center += 1;
    else profile.zones.enemy += 1;
  }
  profile.captureRatio = profile.total ? profile.captures / profile.total : 0;
  profile.checkRatio = profile.total ? profile.checks / profile.total : 0;
  profile.pawnRatio = profile.total ? (profile.pieceCounts.p ?? 0) / profile.total : 0;
  let favoritePiece = 'p';
  let favoritePieceCount = 0;
  for (const piece of ['n', 'b', 'r', 'q', 'p']) {
    const count = profile.pieceCounts[piece] ?? 0;
    if (count > favoritePieceCount) {
      favoritePiece = piece;
      favoritePieceCount = count;
    }
  }
  profile.favoritePiece = favoritePiece;
  let favoriteZone = 'center';
  let favoriteZoneCount = 0;
  for (const zone of ['center', 'own', 'enemy']) {
    const count = profile.zones[zone] ?? 0;
    if (count > favoriteZoneCount) {
      favoriteZone = zone;
      favoriteZoneCount = count;
    }
  }
  profile.favoriteZone = favoriteZone;
  return profile;
}

function zoneOf(square, color) {
  const rank = Number(String(square || '')[1]);
  const relative = color === 'w' ? rank : 9 - rank;
  if (relative <= 3) return 'own';
  if (relative <= 5) return 'center';
  return 'enemy';
}

/**
 * How much a candidate move resembles the user's profiled style (higher is
 * more "the user"). Zero when the profile is empty.
 */
export function styleScore(fen, uci, profile) {
  if (!profile || profile.total === 0) return 0;
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return 0;
  }
  const applied = applyUciMove(chess, uci);
  if (!applied) return 0;
  let score = 0;
  if (applied.piece === profile.favoritePiece) score += 30;
  if (applied.captured && profile.captureRatio >= 0.25) score += 25;
  if (chess.isCheck() && profile.checkRatio >= 0.15) score += 20;
  if (applied.piece === 'p' && profile.pawnRatio >= 0.3) score += 15;
  if (zoneOf(applied.to, applied.color) === profile.favoriteZone) score += 20;
  return score;
}

/**
 * Pick Mimic's move.
 *
 *  - mirror phase: the exact mirror (or closest same-piece stand-in) when
 *    there is a user move to copy, otherwise the engine's best move
 *    ('seed');
 *  - style phase: the candidate that best matches the user's profiled
 *    style, restricted to moves within MAX_STYLE_LOSS_CP of the engine's
 *    best move when engine scores are available.
 *
 * Returns null when no move can be chosen from the given candidates.
 */
export function selectMimicMove(fen, candidates, options = {}) {
  const { history = [] } = options;
  const ranked = dedupeCandidates(candidates);
  const phase = mimicPhase(fen, history);

  if (phase === 'mirror') {
    const mirror = mirrorOfLastUserMove(fen, history);
    if (mirror) {
      return {
        move: mirror.uci,
        mimic: { mode: mirror.exact ? 'mirror' : 'approx', mirrorOf: mirror.mirrorOf },
        mirror: { exact: mirror.exact, piece: mirror.piece },
      };
    }
    // Nothing to copy yet (the bot opens): let the engine decide.
    const seed = ranked[0];
    return seed ? { move: seed.move, mimic: { mode: 'seed', mirrorOf: null }, engineFallback: !Number.isFinite(seed.score) } : null;
  }

  if (ranked.length === 0) return null;
  const botColor = sideToMoveOf(fen);
  const userColor = botColor === 'w' ? 'b' : 'w';
  const profile = userStyleProfile(history, userColor);
  const scored = ranked.map((candidate) => ({ ...candidate, style: styleScore(fen, candidate.move, profile) }));
  const withEngineScores = scored.filter((candidate) => candidate.score !== null);
  const pool = withEngineScores.length > 0
    ? (() => {
        const bestScore = Math.max(...withEngineScores.map((candidate) => candidate.score));
        const within = scored.filter((candidate) => candidate.score === null || candidate.score >= bestScore - MAX_STYLE_LOSS_CP);
        return within.length > 0 ? within : scored;
      })()
    : scored;
  pool.sort(
    (a, b) =>
      b.style - a.style ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      (a.move < b.move ? -1 : a.move > b.move ? 1 : 0),
  );
  const chosen = pool[0];
  return {
    move: chosen.move,
    mimic: { mode: 'style', mirrorOf: null },
    styleScore: chosen.style,
    profile: {
      total: profile.total,
      favoritePiece: profile.favoritePiece,
      favoriteZone: profile.favoriteZone,
      captureRatio: profile.captureRatio,
    },
  };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const ranked = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate.move !== 'string' || seen.has(candidate.move)) continue;
    seen.add(candidate.move);
    ranked.push({
      move: candidate.move,
      score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
      depth: Number(candidate.depth) || 0,
    });
  }
  ranked.sort(
    (a, b) =>
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      b.depth - a.depth ||
      (a.move < b.move ? -1 : a.move > b.move ? 1 : 0),
  );
  return ranked;
}

export default {
  MIMIC_DEFEIT_THRESHOLD,
  MIMIC_MULTIPV,
  MAX_STYLE_LOSS_CP,
  PIECE_POINTS,
  mirrorSquare,
  currentMaterialBalance,
  minReplayedBalance,
  mimicPhase,
  mirrorOfLastUserMove,
  userStyleProfile,
  styleScore,
  selectMimicMove,
};
