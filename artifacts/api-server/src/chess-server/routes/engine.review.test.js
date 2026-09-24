import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';

import engineRouter from './engine.js';

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

describe('POST /engine/evaluate-positions', () => {
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const CHECKMATE_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'; // fool's mate

  it('rejects an empty or missing fens array', async () => {
    const base = await listen();
    const missing = await post(base, '/engine/evaluate-positions', {});
    expect(missing.status).toBe(400);
    const empty = await post(base, '/engine/evaluate-positions', { fens: [] });
    expect(empty.status).toBe(400);
    server.close();
  });

  it('rejects more than 16 positions', async () => {
    const base = await listen();
    const fens = Array.from({ length: 17 }, () => START_FEN);
    const response = await post(base, '/engine/evaluate-positions', { fens });
    expect(response.status).toBe(400);
    server.close();
  });

  it('rejects an invalid FEN entry', async () => {
    const base = await listen();
    const response = await post(base, '/engine/evaluate-positions', { fens: [START_FEN, 'not-a-fen'] });
    expect(response.status).toBe(400);
    server.close();
  });

  it('evaluates real positions and flags finished games', { timeout: 30000 }, async () => {
    const base = await listen();
    const response = await post(base, '/engine/evaluate-positions', {
      fens: [START_FEN, AFTER_E4_FEN, CHECKMATE_FEN],
      movetimeMs: 60,
    });
    expect(response.status).toBe(200);

    const { results, movetimeMs } = response.data;
    expect(movetimeMs).toBe(60);
    expect(results).toHaveLength(3);

    expect(results[0].gameOver).toBe(false);
    expect(results[0].scoreCp).toEqual(expect.any(Number));

    expect(results[1].gameOver).toBe(false);
    expect(results[1].bestSan).toEqual(expect.any(String));

    expect(results[2].gameOver).toBe(true);
    // Side to move is checkmated: known score instead of null
    expect(results[2].scoreCp).toBe(-100000);
    expect(results[2].mate).toBe(0);
    expect(results[2].bestMove).toBeNull();
    server.close();
  });
});
