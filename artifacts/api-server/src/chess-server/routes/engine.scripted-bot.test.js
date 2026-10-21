import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';

import engineRouter, { getSearchParams } from './engine.js';
import { computeScriptedMove } from '../../../../chess/src/engine/bots/scriptedMoves.js';
import { rex } from '../../../../chess/src/engine/bots/personalities/rex.js';

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
  };
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_1_E4_E5_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_1_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_1_E4_E5_2_KE2_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR b kq - 1 2';
// Ka1 vs ka8 + black pawn c6: the only free giveaway is Qd5?? (c6-pawn takes it).
const QUEEN_DONATION_FEN = 'k7/8/2p5/8/8/8/8/K2Q4 w - - 0 3';

const NELSON_LIKE_BOT = { name: 'Nelson', depth: 1, nodes: 100, blunderChance: 0.35, missedTacticsChance: 0.5 };
const REX_BOT = clientBotPayload(rex);

describe('rex personality', () => {
  it('is the highest-rated bot, ahead of Magnus and the custom slider cap', async () => {
    const { BOTS } = await import('../../../../chess/src/engine/bots/bots.js');
    const others = BOTS.filter((bot) => bot.id !== 'rex');
    expect(rex.rating).toBe(2900);
    expect(others.length).toBeGreaterThan(0);
    for (const bot of others) {
      expect(rex.rating).toBeGreaterThan(bot.rating);
    }
  });
});

describe('computeScriptedMove', () => {
  it('returns the Bongcloud moves for White at the scripted move numbers', () => {
    expect(computeScriptedMove(START_FEN, rex.scriptedOpening)).toBe('e2e4');
    expect(computeScriptedMove(AFTER_1_E4_E5_FEN, rex.scriptedOpening)).toBe('e1e2');
  });

  it('mirrors the Bongcloud for Black as early as legal', () => {
    expect(computeScriptedMove(AFTER_1_E4_FEN, rex.scriptedOpening)).toBe('e7e5');
    expect(computeScriptedMove(AFTER_1_E4_E5_2_KE2_FEN, rex.scriptedOpening)).toBe('e8e7');
  });

  it('finds a free queen donation when the opponent attacks the square', () => {
    expect(computeScriptedMove(QUEEN_DONATION_FEN, rex.scriptedOpening)).toBe('d1d5');
  });

  it('returns null outside the sacrifice window and without a script', () => {
    const late = 'k7/8/2p5/8/8/8/8/K2Q4 w - - 0 9';
    expect(computeScriptedMove(late, rex.scriptedOpening)).toBeNull();
    expect(computeScriptedMove(START_FEN, undefined)).toBeNull();
  });
});

describe('POST /engine/move with scripted and maxStrength bots', () => {
  it('plays the scripted Bongcloud moves without consulting the engine', async () => {
    const base = await listen();
    const first = await post(base, '/engine/move', { fen: START_FEN, bot: REX_BOT });
    expect(first.status).toBe(200);
    expect(first.data.bestMove).toBe('e2e4');
    expect(first.data.scripted).toBe(true);

    const second = await post(base, '/engine/move', { fen: AFTER_1_E4_E5_FEN, bot: REX_BOT });
    expect(second.data.bestMove).toBe('e1e2');

    const blackFirst = await post(base, '/engine/move', { fen: AFTER_1_E4_FEN, bot: REX_BOT });
    expect(blackFirst.data.bestMove).toBe('e7e5');

    const blackSecond = await post(base, '/engine/move', { fen: AFTER_1_E4_E5_2_KE2_FEN, bot: REX_BOT });
    expect(blackSecond.data.bestMove).toBe('e8e7');
    server.close();
  });

  it('returns the free queen donation from the route', async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: QUEEN_DONATION_FEN, bot: REX_BOT });
    expect(response.status).toBe(200);
    expect(response.data.bestMove).toBe('d1d5');
    expect(response.data.scripted).toBe(true);
    server.close();
  });

  it('keeps normal bots on the engine path', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/move', { fen: START_FEN, bot: NELSON_LIKE_BOT });
    expect(response.status).toBe(200);
    expect(response.data.bestMove).toEqual(expect.any(String));
    expect(response.data.engineFallback).toBeUndefined();
    server.close();
  });

  it('runs a full-strength search for maxStrength bots after the script ends', { timeout: 30000 }, async () => {
    const base = await listen();
    const lateFen = 'k7/8/2p5/8/8/8/8/K2Q4 w - - 0 9';
    const response = await post(base, '/engine/move', { fen: lateFen, bot: REX_BOT });
    expect(response.status).toBe(200);
    expect(response.data.scripted).toBeUndefined();
    expect(response.data.bestMove).toEqual(expect.any(String));
    expect(response.data.engineFallback).toBeUndefined();
    server.close();
  });
});

describe('getSearchParams', () => {
  it('uses a movetime-bounded full-strength search for maxStrength bots', () => {
    expect(getSearchParams(REX_BOT)).toMatch(/^go movetime \d+$/);
  });

  it('keeps the existing strength mapping for other bots', () => {
    expect(getSearchParams(null)).toBe('go depth 10');
    expect(getSearchParams({ name: 'Magnus', depth: 5, nodes: 100000 })).toBe('go depth 5');
    expect(getSearchParams({ name: 'Pip', depth: 1, nodes: 60 })).toBe('go nodes 60');
  });
});
