import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';
import { Chess } from 'chess.js';

import engineRouter from './engine.js';
import {
  evaluateStallMove,
  positionKey,
  replayPositionKeys,
  selectStallMove,
} from '../../../../chess/src/engine/bots/stallMove.js';
import { stallfish } from '../../../../chess/src/engine/bots/personalities/stallfish.js';
import { BOTS, botRequiresSubscription, getBotById } from '../../../../chess/src/engine/bots/bots.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/engine', engineRouter);

const server = http.createServer(app);

async function listen() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

// The client (ChessGame.jsx) forwards a whitelisted subset of the personality.
function clientBotPayload(bot) {
  return {
    name: bot.name,
    depth: bot.depth,
    nodes: bot.nodes,
    blunderChance: bot.blunderChance,
    missedTacticsChance: bot.missedTacticsChance,
    maxStrength: bot.maxStrength,
    scriptedOpening: bot.scriptedOpening,
    playStyle: bot.playStyle,
    brilliant: bot.brilliant,
    stall: bot.stall,
  };
}

const STALL_BOT = clientBotPayload(stallfish);
const PLAIN_BOT = { name: 'Nelson', depth: 3, nodes: 5000, blunderChance: 0.35, missedTacticsChance: 0.5 };

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

// A bare back rank: Rd8 is checkmate, and Stallfish refuses to end the game
// even when the ending is a win.
const BACK_RANK_MATE_FEN = '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1';

// White queen b6-c7 leaves the black king on a8 with no move and no check:
// stalemate, which ends the game just as surely as mate does.
const STALEMATE_FEN = 'k7/8/1Q6/8/8/8/8/K7 w - - 0 1';

// After 1.f3 e5, g2-g4 walks into ...Qh4#, the classic fool's mate.
const FOOLS_MATE_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';

const KNIGHT_SHUFFLE_HISTORY = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];

describe('Stallfish roster entry', () => {
  it('is registered as a free bot with a stall flag and zero aggression', () => {
    const bot = getBotById('stallfish');
    expect(bot.id).toBe('stallfish');
    expect(bot.name).toBe('Stallfish');
    expect(bot.stall).toBe(true);
    expect(bot.playStyle.aggression).toBe(0);
    expect(bot.playStyle.drawTolerance).toBe(0);
    expect(bot.blunderChance).toBe(0);
    expect(bot.missedTacticsChance).toBe(0);
    expect(botRequiresSubscription(bot)).toBe(false);
    expect(BOTS.some((candidate) => candidate.id === 'stallfish')).toBe(true);
  });

  it('keeps every quote set the board talks through', () => {
    for (const category of ['start', 'thinking', 'win', 'lose', 'draw', 'check', 'capture', 'goodMove', 'blunder', 'stall']) {
      expect(stallfish.quotes[category]?.length).toBeGreaterThan(0);
    }
  });

  it('does not change which bots are subscription-only', () => {
    const premium = BOTS.filter((bot) => bot.requiresSubscription).map((bot) => bot.id).sort();
    expect(premium).toEqual(['nadia', 'rex']);
  });
});

describe('evaluateStallMove', () => {
  it('refuses to deliver checkmate', () => {
    const verdict = evaluateStallMove(BACK_RANK_MATE_FEN, 'd1d8', { score: 100000, bestScore: 100000 });
    expect(verdict.stall).toBe(false);
    expect(verdict.reason).toBe('checkmate');
  });

  it('refuses to deliver stalemate', () => {
    const verdict = evaluateStallMove(STALEMATE_FEN, 'b6c7', { score: 10, bestScore: 10 });
    expect(verdict.stall).toBe(false);
    expect(verdict.reason).toBe('stalemate');
  });

  it('refuses a move that allows mate in one', () => {
    const verdict = evaluateStallMove(FOOLS_MATE_FEN, 'g2g4', { score: 20, bestScore: 20 });
    expect(verdict.stall).toBe(false);
    expect(verdict.reason).toBe('mate-in-1-against');
  });

  it('refuses a quiet move on the 100th halfmove, but takes the pawn push that resets the clock', () => {
    const lateFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 99 50';
    const quiet = evaluateStallMove(lateFen, 'g1f3', { score: 10, bestScore: 10 });
    expect(quiet.stall).toBe(false);
    expect(quiet.reason).toBe('fifty-move-draw');

    const push = evaluateStallMove(lateFen, 'e2e4', { score: 10, bestScore: 10 });
    expect(push.stall).toBe(true);
  });

  it('refuses a third repetition of a position', () => {
    const verdict = evaluateStallMove(START_FEN, 'g1f3', {
      score: 20,
      bestScore: 20,
      history: KNIGHT_SHUFFLE_HISTORY,
    });
    expect(verdict.stall).toBe(false);
    expect(verdict.reason).toBe('threefold-repetition');
  });

  it('ignores a history that does not replay onto the FEN', () => {
    const verdict = evaluateStallMove(START_FEN, 'g1f3', {
      score: 20,
      bestScore: 20,
      history: ['e4', 'e5'],
    });
    expect(verdict.stall).toBe(true);
  });

  it('rejects illegal moves and bad FENs', () => {
    expect(evaluateStallMove(START_FEN, 'e2e5').reason).toBe('illegal-move');
    expect(evaluateStallMove('not a fen', 'e2e4').reason).toBe('invalid-fen');
  });
});

describe('position history helpers', () => {
  it('keys positions without the clocks', () => {
    expect(positionKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('replays a SAN history onto its FEN', () => {
    const keys = replayPositionKeys(['e4'], AFTER_E4_FEN);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(positionKey(AFTER_E4_FEN));
    expect(replayPositionKeys(['e4'], START_FEN)).toBeNull();
  });
});

describe('selectStallMove', () => {
  it('prefers a quiet reversible shuffle over the engine best pawn push', () => {
    const pick = selectStallMove(START_FEN, [
      { move: 'e2e4', score: 30, depth: 10 },
      { move: 'g1f3', score: 20, depth: 10 },
    ]);
    expect(pick.move).toBe('g1f3');
    expect(pick.stall).toBe(true);
    expect(pick.refusedEnding).toBeNull();
  });

  it('plays the quiet rook move and reports the mate it refused', () => {
    const pick = selectStallMove(BACK_RANK_MATE_FEN, [
      { move: 'd1d8', score: 100000, depth: 10 },
      { move: 'd1d2', score: 0, depth: 10 },
    ]);
    expect(pick.move).toBe('d1d2');
    expect(pick.stall).toBe(true);
    expect(pick.refusedEnding).toBe('checkmate');
  });

  it('takes the pawn push when the fifty-move clock is about to run out', () => {
    const lateFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 99 50';
    const pick = selectStallMove(lateFen, [
      { move: 'g1f3', score: 30, depth: 10 },
      { move: 'e2e4', score: 10, depth: 10 },
    ]);
    expect(pick.move).toBe('e2e4');
    expect(pick.stall).toBe(true);
  });

  it('plays the engine move as a last resort when every move ends the game', () => {
    const pick = selectStallMove(BACK_RANK_MATE_FEN, [{ move: 'd1d8', score: 100000, depth: 10 }]);
    expect(pick.move).toBe('d1d8');
    expect(pick.stall).toBe(false);
    expect(pick.reason).toBe('no-stall-move-available');
  });

  it('returns null without candidates so the caller falls back to the engine', () => {
    expect(selectStallMove(START_FEN, [])).toBeNull();
    expect(selectStallMove(START_FEN, undefined)).toBeNull();
  });
});

describe('POST /engine/move for Stallfish', () => {
  it('answers with a legal stall-safe move from a MultiPV search', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: START_FEN, bot: STALL_BOT, history: [] });
    expect(response.status).toBe(200);
    expect(response.data.engineFallback).toBeUndefined();
    expect(response.data.stall).toBe(true);
    expect(response.data.refusedEnding).toBeNull();
    expect(response.data.brilliant).toBe(false);

    const chess = new Chess(START_FEN);
    expect(chess.move(response.data.bestMove)).toBeTruthy();
    server.close();
  });

  it('accepts a SAN history and still answers legally', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', {
      fen: AFTER_E4_FEN,
      bot: STALL_BOT,
      history: ['e4'],
    });
    expect(response.status).toBe(200);
    expect(response.data.engineFallback).toBeUndefined();
    expect(response.data.stall).toBe(true);

    const chess = new Chess(AFTER_E4_FEN);
    expect(chess.move(response.data.bestMove)).toBeTruthy();
    server.close();
  });

  it('keeps other bots on the plain single-line search', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: START_FEN, bot: PLAIN_BOT });
    expect(response.status).toBe(200);
    expect(response.data.stall).toBe(false);
    expect(response.data.refusedEnding).toBeNull();
    expect(response.data.engineFallback).toBeUndefined();
    server.close();
  });
});
