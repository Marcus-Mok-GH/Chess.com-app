import { Chess } from 'chess.js';

/**
 * Scripted bot preamble for personality-driven opening theatrics.
 *
 * Bots may declare a `scriptedOpening` object:
 *
 *   scriptedOpening: {
 *     byColor: {
 *       w: { 1: 'e2e4', 2: 'e1e2', 3: { sacrifice: { pieces: ['q', 'r'], from: 3, until: 8 } } },
 *       b: { 1: 'e7e5', 2: 'e8e7', 3: ... },
 *     },
 *   }
 *
 * Entries are keyed by the bot's own move number (the FEN fullmove counter,
 * which counts each side's moves separately): a fixed UCI move plays when it
 * is legal on that turn, otherwise the engine takes over that move. A
 * sacrifice entry opens a window (bot move numbers `from..until`) in which
 * the bot looks for a free "giveaway": a queen or rook move to a square the
 * opponent attacks and we cannot recapture — a deliberate donation, never a
 * check and never a capture.
 *
 * The evaluator is stateless: each request only sees the current FEN, so
 * undo/redo and restored games replay identically. It is consumed by the
 * api-server engine route, before any engine search happens.
 */

const SACRIFICE_PIECES = ['q', 'r'];
const ATTACKER_ORDER = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

function isFiniteInteger(value) {
  return Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Resolve the scripted entry (if any) that applies to the bot's current move
 * number: an exact fixed-move key wins, otherwise the first sacrifice window
 * whose `from..until` range covers the move number.
 */
function findScriptEntry(perColor, botMoveNumber) {
  const exact = perColor[botMoveNumber];
  if (exact !== undefined) return exact;
  for (const value of Object.values(perColor)) {
    if (value && typeof value === 'object' && value.sacrifice) {
      const { from, until } = value.sacrifice;
      if (
        isFiniteInteger(from) &&
        isFiniteInteger(until) &&
        botMoveNumber >= from &&
        botMoveNumber <= until
      ) {
        return value;
      }
    }
  }
  return null;
}

/** Apply a UCI move to a position; returns the applied move or null. */
function applyUci(chess, uci) {
  if (typeof uci !== 'string' || uci.length < 4) return null;
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}),
    }) || null;
  } catch {
    return null;
  }
}

/**
 * Find a free giveaway move ("hanging piece") for the side to move: a
 * non-capture, non-check queen/rook move to a square an enemy piece attacks
 * and no friendly piece defends (i.e. the opponent can just take it).
 * Prefers the queen, then rooks, then the cheapest attacker as the taker.
 * Returns the chosen move object (chess.js verbose shape) or null.
 */
export function searchSacrificeMove(chess, { pieces = SACRIFICE_PIECES } = {}) {
  const wanted = pieces.filter((p) => SACRIFICE_PIECES.includes(p));
  const candidates = [];
  for (const move of chess.moves({ verbose: true })) {
    if (!wanted.includes(move.piece)) continue;
    if (move.captured) continue;
    try {
      chess.move(move);
    } catch {
      continue;
    }
    // Never give away with check: a check forces the reply and is not a calm donation.
    if (chess.inCheck() || chess.isCheckmate()) {
      chess.undo();
      continue;
    }
    // Attacker: any enemy legal move that lands on the donated square and
    // captures the donated piece. Pick the cheapest attacker first.
    const attackers = chess
      .moves({ verbose: true })
      .filter((reply) => reply.to === move.to && reply.captured === move.piece)
      .sort((a, b) => (ATTACKER_ORDER[a.piece] ?? 9) - (ATTACKER_ORDER[b.piece] ?? 9));
    if (attackers.length > 0) {
      // "For nothing": the opponent captures and we have no recapture.
      try {
        chess.move(attackers[0]);
        const defended = chess
          .moves({ verbose: true })
          .some((recapture) => recapture.to === move.to && recapture.captured);
        if (!defended) candidates.push({ move, attacker: attackers[0].piece });
        chess.undo();
      } catch {
        // Attacker no longer legal for some reason; treat as nothing to attack.
      }
    }
    chess.undo();
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const pieceDiff = wanted.indexOf(a.move.piece) - wanted.indexOf(b.move.piece);
    if (pieceDiff !== 0) return pieceDiff;
    return (ATTACKER_ORDER[a.attacker] ?? 9) - (ATTACKER_ORDER[b.attacker] ?? 9);
  });
  return candidates[0].move;
}

/**
 * Compute the scripted move for the current position, or null when the
 * engine should play instead (no script, wrong turn, illegal move, or no
 * giveaway available yet).
 *
 * @param {string} fen - Current position; the side to move is the bot.
 * @param {object} [script] - Bot's `scriptedOpening` value, or null/undefined.
 * @returns {string|null} UCI move to play immediately, or null.
 */
export function computeScriptedMove(fen, script) {
  if (!script || typeof script !== 'object' || !script.byColor || typeof fen !== 'string') {
    return null;
  }
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  const perColor = script.byColor[chess.turn()];
  if (!perColor || typeof perColor !== 'object') return null;

  // The FEN fullmove counter equals the current move number for BOTH sides
  // while they are to move (it increments after Black replies).
  const fenParts = fen.trim().split(/\s+/);
  const botMoveNumber = Number.parseInt(fenParts[5], 10);
  if (!isFiniteInteger(botMoveNumber) || botMoveNumber < 1) return null;

  const entry = findScriptEntry(perColor, botMoveNumber);
  if (entry == null) return null;

  if (typeof entry === 'string') {
    const applied = applyUci(chess, entry);
    return applied ? entry : null;
  }
  if (entry && typeof entry === 'object' && entry.sacrifice) {
    const giveaway = searchSacrificeMove(chess, entry.sacrifice);
    return giveaway ? giveaway.from + giveaway.to + (giveaway.promotion || '') : null;
  }
  return null;
}

export default { computeScriptedMove, searchSacrificeMove };
