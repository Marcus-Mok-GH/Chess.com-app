import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';
import { Chess } from 'chess.js';

import engineRouter from './engine.js';
import {
  evaluateBrilliance,
  materialGivenAway,
  selectBrilliantMove,
} from '../../../../chess/src/engine/bots/brilliantMove.js';
import { brilliant } from '../../../../chess/src/engine/bots/personalities/brilliant.js';
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
  };
}

const BRILLIANT_BOT = clientBotPayload(brilliant);
const PLAIN_BOT = { name: 'Nelson', depth: 3, nodes: 5000, blunderChance: 0.35, missedTacticsChance: 0.5 };

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// King and pawns for both sides plus a black h5-pawn: Qg4 on the queen's next
// move walks straight into hxg4, so it is a full queen giveaway.
const QUEEN_GIVEAWAY_FEN = '6k1/5pp1/8/7p/3Q4/8/5PPP/6K1 w - - 0 1';

// A bare back rank: Rd8 is checkmate, and mates are never counted as brilliancies.
const BACK_RANK_MATE_FEN = '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1';

describe('Mr. Brilliant roster entry', () => {
  it('is registered as a free bot with a brilliancy flag', () => {
    const bot = getBotById('brilliant');
    expect(bot.id).toBe('brilliant');
    expect(bot.name).toBe('Mr. Brilliant');
    expect(bot.brilliant).toBe(true);
    expect(botRequiresSubscription(bot)).toBe(false);
    expect(BOTS.some((candidate) => candidate.id === 'brilliant')).toBe(true);
  });

  it('keeps every quote set the board talks through', () => {
    for (const category of ['start', 'win', 'lose', 'draw', 'check', 'capture', 'goodMove', 'blunder', 'brilliant']) {
      expect(brilliant.quotes[category]?.length).toBeGreaterThan(0);
    }
  });

  it('does not change which bots are subscription-only', () => {
    const premium = BOTS.filter((bot) => bot.requiresSubscription).map((bot) => bot.id).sort();
    expect(premium).toEqual(['nadia', 'rex']);
  });
});

describe('brilliancy detection', () => {
  it('prices the material a queen giveaway hands over', () => {
    const chess = new Chess(QUEEN_GIVEAWAY_FEN);
    const applied = chess.move({ from: 'd4', to: 'g4' });
    expect(materialGivenAway(chess, applied)).toBe(900);
  });

  it('accepts a sacrifice that stays close to the best move', () => {
    const verdict = evaluateBrilliance(QUEEN_GIVEAWAY_FEN, 'd4g4', { score: 10, bestScore: 20 });
    expect(verdict.brilliant).toBe(true);
    expect(verdict.sacrifice).toBe(900);
  });

  it('rejects the same sacrifice when it costs too much evaluation', () => {
    const verdict = evaluateBrilliance(QUEEN_GIVEAWAY_FEN, 'd4g4', { score: -300, bestScore: 20 });
    expect(verdict.brilliant).toBe(false);
    expect(verdict.reason).toBe('worse-than-best-move');
  });

  it('rejects a quiet move that gives nothing away', () => {
    const verdict = evaluateBrilliance(QUEEN_GIVEAWAY_FEN, 'd4d1', { score: 20, bestScore: 20 });
    expect(verdict.brilliant).toBe(false);
    expect(verdict.reason).toBe('no-sacrifice');
  });

  it('rejects a mating move, which stays the engine’s move to play', () => {
    const verdict = evaluateBrilliance(BACK_RANK_MATE_FEN, 'd1d8', { score: 100000, bestScore: 100000 });
    expect(verdict.brilliant).toBe(false);
    expect(verdict.reason).toBe('checkmate');
  });

  it('rejects a simplifying move that only trades material', () => {
    const verdict = evaluateBrilliance(START_FEN, 'e2e4', { score: 20, bestScore: 20 });
    expect(verdict.brilliant).toBe(false);
    expect(verdict.reason).toBe('no-sacrifice');
  });
});

describe('selectBrilliantMove', () => {
  it('plays the largest sound sacrifice instead of the top move', () => {
    const pick = selectBrilliantMove(QUEEN_GIVEAWAY_FEN, [
      { move: 'd4d1', score: 20, depth: 16 },
      { move: 'd4g4', score: 10, depth: 16 },
    ]);
    expect(pick.move).toBe('d4g4');
    expect(pick.brilliant).toBe(true);
    expect(pick.sacrifice).toBe(900);
  });

  it('keeps the engine move when nothing on the board sacrifices', () => {
    const pick = selectBrilliantMove(START_FEN, [{ move: 'e2e4', score: 30, depth: 16 }]);
    expect(pick.move).toBe('e2e4');
    expect(pick.brilliant).toBe(false);
    expect(pick.reason).toBe('no-sacrifice-available');
  });

  it('takes a forced mate over style', () => {
    const pick = selectBrilliantMove(QUEEN_GIVEAWAY_FEN, [
      { move: 'd4d8', score: 100000, depth: 16 },
      { move: 'd4g4', score: 10, depth: 16 },
    ]);
    expect(pick.move).toBe('d4d8');
    expect(pick.brilliant).toBe(false);
    expect(pick.reason).toBe('mate');
  });

  it('returns null without candidates so the caller falls back to the engine', () => {
    expect(selectBrilliantMove(START_FEN, [])).toBeNull();
    expect(selectBrilliantMove(START_FEN, undefined)).toBeNull();
  });
});

describe('POST /engine/move for Mr. Brilliant', () => {
  it('answers with a legal move from a MultiPV search', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: START_FEN, bot: BRILLIANT_BOT });
    expect(response.status).toBe(200);
    expect(response.data.engineFallback).toBeUndefined();
    expect(typeof response.data.brilliant).toBe('boolean');
    expect(response.data.candidates.length).toBeGreaterThan(1);

    const chess = new Chess(START_FEN);
    expect(chess.move(response.data.bestMove)).toBeTruthy();
    server.close();
  });

  it('keeps other bots on the plain single-line search', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: START_FEN, bot: PLAIN_BOT });
    expect(response.status).toBe(200);
    expect(response.data.brilliant).toBe(false);
    expect(response.data.engineFallback).toBeUndefined();
    server.close();
  });
});
