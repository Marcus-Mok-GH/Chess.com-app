import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';
import { Chess } from 'chess.js';

import engineRouter from './engine.js';
import {
  MIMIC_DEFEIT_THRESHOLD,
  currentMaterialBalance,
  mimicPhase,
  mirrorOfLastUserMove,
  selectMimicMove,
  userStyleProfile,
} from '../../../../chess/src/engine/bots/mimicMove.js';
import { mimic } from '../../../../chess/src/engine/bots/personalities/mimic.js';
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
    mimic: bot.mimic,
  };
}

const MIMIC_BOT = clientBotPayload(mimic);
const PLAIN_BOT = { name: 'Nelson', depth: 3, nodes: 5000, blunderChance: 0.35, missedTacticsChance: 0.5 };

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

// A legal 16-ply game where Black's knight raids c2, a1 and c1: White (the
// bot, side to move at the end) is down nine points, so Mimic must be in
// its style phase. Black's play profiles as knight-heavy, capture-happy
// and enemy-half oriented.
const STYLE_HISTORY = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nd4', 'Qg3', 'Nxc2+', 'Kd1', 'Nxa1', 'd3', 'Nb3', 'h3', 'Nxc1'];
const STYLE_FEN = 'r1bqkbnr/pppp1p1p/6p1/4p3/2B1P3/3P2QP/PP3PP1/1NnK2NR w kq - 0 9';

// Board-only deficit fixtures (empty history): exactly eight points down
// switches to the style phase, seven does not.
const DEFICIT_8_FEN = '4rk2/4p3/p7/3p4/8/8/8/4K3 w - - 0 1';
const DEFICIT_7_FEN = '4rk2/4p3/p7/8/8/8/8/4K3 w - - 0 1';

// Black's ...b7b5 double push: the exact mirror b2b4 is blocked by White's
// own b4 pawn, so the closest same-piece stand-in must capture on b5.
const EP_APPROX_HISTORY = ['b4', 'h5', 'c4', 'h4', 'a4', 'b5'];
// Black's ...e7e5: the mirror e2e4 is blocked by White's own e4 pawn.
const PLAIN_APPROX_HISTORY = ['e4', 'a5', 'a4', 'e5'];

function fenFromHistory(history) {
  const chess = new Chess();
  for (const san of history) chess.move(san);
  return chess.fen();
}

describe('Mimic roster entry', () => {
  it('is registered as a free bot with the mimic flag', () => {
    const bot = getBotById('mimic');
    expect(bot.id).toBe('mimic');
    expect(bot.name).toBe('Mimic');
    expect(bot.rating).toBe(1400);
    expect(bot.mimic).toBe(true);
    expect(bot.blunderChance).toBe(0);
    expect(bot.missedTacticsChance).toBe(0);
    expect(botRequiresSubscription(bot)).toBe(false);
    expect(BOTS.some((candidate) => candidate.id === 'mimic')).toBe(true);
  });

  it('keeps every quote set the board talks through, including the copycat sets', () => {
    for (const category of ['start', 'thinking', 'win', 'lose', 'draw', 'check', 'capture', 'goodMove', 'blunder', 'mirror', 'styleShift']) {
      expect(mimic.quotes[category]?.length).toBeGreaterThan(0);
    }
  });

  it('does not change which bots are subscription-only', () => {
    const premium = BOTS.filter((bot) => bot.requiresSubscription).map((bot) => bot.id).sort();
    expect(premium).toEqual(['nadia', 'rex']);
  });
});

describe('mimicPhase', () => {
  it('starts in the mirror phase', () => {
    expect(mimicPhase(START_FEN, [])).toBe('mirror');
    expect(mimicPhase(AFTER_E4_FEN, ['e4'])).toBe('mirror');
    expect(MIMIC_DEFEIT_THRESHOLD).toBe(8);
  });

  it('switches to the style phase once the replayed deficit reaches eight points', () => {
    expect(mimicPhase(STYLE_FEN, STYLE_HISTORY)).toBe('style');
    expect(currentMaterialBalance(STYLE_FEN, 'w')).toBeLessThanOrEqual(-MIMIC_DEFEIT_THRESHOLD);
  });

  it('stays in the style phase even after winning material back', () => {
    // White recaptures the raiding knight (deficit shrinks to six), but the
    // eight-point fall already happened, so the copying never resumes.
    const history = [...STYLE_HISTORY, 'Kxc1', 'a6'];
    const fen = fenFromHistory(history);
    expect(currentMaterialBalance(fen, 'w')).toBeGreaterThan(-MIMIC_DEFEIT_THRESHOLD);
    expect(mimicPhase(fen, history)).toBe('style');
  });

  it('judges by the board when the history does not replay onto the FEN', () => {
    expect(mimicPhase(DEFICIT_8_FEN, [])).toBe('style');
    expect(mimicPhase(DEFICIT_7_FEN, [])).toBe('mirror');
    expect(mimicPhase(START_FEN, ['e4'])).toBe('mirror');
  });
});

describe('mirrorOfLastUserMove', () => {
  it('mirrors the user\'s last move exactly', () => {
    const mirror = mirrorOfLastUserMove(AFTER_E4_FEN, ['e4']);
    expect(mirror).toEqual({ uci: 'e7e5', mirrorOf: 'e4', exact: true, piece: 'p' });
  });

  it('mirrors onto the bot\'s own half when the bot plays White', () => {
    const history = ['d4', 'e5'];
    const mirror = mirrorOfLastUserMove(fenFromHistory(history), history);
    expect(mirror).toEqual({ uci: 'e2e4', mirrorOf: 'e5', exact: true, piece: 'p' });
  });

  it('mirrors castling', () => {
    const history = ['e4', 'e5', 'Nf3', 'Nf6', 'Bc4', 'Bc5', 'O-O'];
    const mirror = mirrorOfLastUserMove(fenFromHistory(history), history);
    expect(mirror).toEqual({ uci: 'e8g8', mirrorOf: 'O-O', exact: true, piece: 'k' });
  });

  it('falls back to the closest same-piece capture when the mirror is blocked (en passant available)', () => {
    const mirror = mirrorOfLastUserMove(fenFromHistory(EP_APPROX_HISTORY), EP_APPROX_HISTORY);
    expect(mirror?.exact).toBe(false);
    expect(mirror?.mirrorOf).toBe('b5');
    expect(mirror?.piece).toBe('p');
    const chess = new Chess(fenFromHistory(EP_APPROX_HISTORY));
    const applied = chess.move({ from: mirror.uci.slice(0, 2), to: mirror.uci.slice(2, 4) });
    expect(applied?.captured).toBe('p');
  });

  it('falls back to the closest same-piece push when the mirror is blocked', () => {
    const mirror = mirrorOfLastUserMove(fenFromHistory(PLAIN_APPROX_HISTORY), PLAIN_APPROX_HISTORY);
    expect(mirror).toEqual({ uci: 'f2f4', mirrorOf: 'e5', exact: false, piece: 'p' });
  });

  it('returns null without a user move to copy', () => {
    expect(mirrorOfLastUserMove(START_FEN, [])).toBeNull();
    // The history ends on the bot's own move, not the user's.
    expect(mirrorOfLastUserMove(AFTER_E4_FEN, ['e4', 'e5'])).toBeNull();
  });
});

describe('userStyleProfile', () => {
  it('profiles the user\'s pieces, captures and zones from the history', () => {
    const profile = userStyleProfile(STYLE_HISTORY, 'b');
    expect(profile.total).toBe(8);
    expect(profile.favoritePiece).toBe('n');
    expect(profile.favoriteZone).toBe('enemy');
    expect(profile.captureRatio).toBeCloseTo(3 / 8);
    expect(profile.checks).toBe(1);
  });

  it('returns an empty profile without history', () => {
    expect(userStyleProfile([], 'b').total).toBe(0);
  });
});

describe('selectMimicMove', () => {
  it('copies the user\'s move even when the engine prefers another line', () => {
    const pick = selectMimicMove(AFTER_E4_FEN, [
      { move: 'e7e5', score: 30, depth: 10 },
      { move: 'g8f6', score: 25, depth: 10 },
    ], { history: ['e4'] });
    expect(pick.move).toBe('e7e5');
    expect(pick.mimic).toEqual({ mode: 'mirror', mirrorOf: 'e4' });
  });

  it('answers from pure logic with an empty candidate pool (route fast path)', () => {
    const pick = selectMimicMove(AFTER_E4_FEN, [], { history: ['e4'] });
    expect(pick.move).toBe('e7e5');
    expect(pick.mimic.mode).toBe('mirror');
  });

  it('seeds with the engine move when the bot opens and there is nothing to copy', () => {
    const pick = selectMimicMove(START_FEN, [{ move: 'e2e4', score: 30, depth: 10 }], { history: [] });
    expect(pick.move).toBe('e2e4');
    expect(pick.mimic).toEqual({ mode: 'seed', mirrorOf: null });
  });

  it('plays the user\'s style in the style phase', () => {
    const pick = selectMimicMove(STYLE_FEN, [
      { move: 'b1c3', score: 0, depth: 10 },
      { move: 'd1c1', score: 100, depth: 10 },
      { move: 'a2a3', score: -20, depth: 10 },
    ], { history: STYLE_HISTORY });
    // Nc3 matches the user's knight-heavy style; Kxc1 wins material back
    // but is not how the user plays.
    expect(pick.move).toBe('b1c3');
    expect(pick.mimic).toEqual({ mode: 'style', mirrorOf: null });
    expect(pick.styleScore).toBe(30);
  });

  it('will not style-match a move far below the engine\'s best', () => {
    const pick = selectMimicMove(STYLE_FEN, [
      { move: 'd1c1', score: 300, depth: 10 },
      { move: 'b1c3', score: 50, depth: 10 },
    ], { history: STYLE_HISTORY });
    expect(pick.move).toBe('d1c1');
    expect(pick.mimic.mode).toBe('style');
  });

  it('style-matches unscored legal moves when the engine is unavailable', () => {
    const pick = selectMimicMove(STYLE_FEN, [
      { move: 'b1c3', score: null, depth: 0 },
      { move: 'd1c1', score: null, depth: 0 },
      { move: 'a2a3', score: null, depth: 0 },
    ], { history: STYLE_HISTORY });
    expect(pick.move).toBe('b1c3');
    expect(pick.mimic.mode).toBe('style');
  });

  it('returns null in the style phase without candidates', () => {
    expect(selectMimicMove(STYLE_FEN, [], { history: STYLE_HISTORY })).toBeNull();
  });
});

describe('POST /engine/move for Mimic', () => {
  it('answers the mirror fast path without the engine', async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: AFTER_E4_FEN, bot: MIMIC_BOT, history: ['e4'] });
    expect(response.status).toBe(200);
    expect(response.data.bestMove).toBe('e7e5');
    expect(response.data.mimic).toEqual({ mode: 'mirror', mirrorOf: 'e4' });
    expect(response.data.engineFallback).toBeUndefined();
    server.close();
  });

  it('answers the style phase with a legal move', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: STYLE_FEN, bot: MIMIC_BOT, history: STYLE_HISTORY });
    expect(response.status).toBe(200);
    expect(response.data.mimic?.mode).toBe('style');
    const chess = new Chess(STYLE_FEN);
    expect(chess.move(response.data.bestMove)).toBeTruthy();
    server.close();
  });

  it('keeps other bots on the plain search without a mimic field', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: START_FEN, bot: PLAIN_BOT });
    expect(response.status).toBe(200);
    expect(response.data.mimic).toBeNull();
    const chess = new Chess(START_FEN);
    expect(chess.move(response.data.bestMove)).toBeTruthy();
    server.close();
  });
});
