import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';
import { Chess } from 'chess.js';

import openingRoutes from './openings.js';

const START_FEN = new Chess().fen();

function fensFor(sans) {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

// Pairs for playing `sans` from the start position, with `uciOverrides` letting
// individual plies deviate (index -> uci).
function movesFor(sans, uciOverrides = {}) {
  const fens = fensFor(sans);
  const chess = new Chess();
  return sans.map((san, index) => {
    chess.move(san);
    const move = chess.history({ verbose: true })[chess.history().length - 1];
    return {
      fen: fens[index],
      uci: uciOverrides[index] ?? move.from + move.to,
    };
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/openings', openingRoutes);
  return app;
}

function loopback(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const payload = body == null ? null : JSON.stringify(body);
      const headers = payload ? { 'content-type': 'application/json' } : {};
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers },
        (res) => {
          let buf = '';
          res.on('data', (chunk) => (buf += chunk));
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body: JSON.parse(buf) })));
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('POST /api/openings/book-moves', () => {
  it('flags the played moves as book while the game follows opening theory', async () => {
    // 1.e4 e5 2.Nf3 Nc6 stays inside the Ruy Lopez book line.
    const res = await loopback(buildApp(), 'POST', '/api/openings/book-moves', {
      moves: movesFor(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results.map((result) => result.book)).toEqual([true, true, true, true, true]);
    expect(res.body.results.map((result) => result.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(res.body.results[0].fen).toBe(START_FEN);
    expect(res.body.results[4].uci).toBe('f1b5');
  });

  it('stops flagging after the game leaves the book, not just for that ply', async () => {
    // 1.e4 is book; Grob-style 1...g5 is legal but off book; whatever follows is off book too.
    const res = await loopback(buildApp(), 'POST', '/api/openings/book-moves', {
      moves: movesFor(['e4', 'g5', 'Nf3'], { 1: 'g7g5' }),
    });

    expect(res.status).toBe(200);
    expect(res.body.results.map((result) => result.book)).toEqual([true, false, false]);
    // SAN is still resolved for off-book plies.
    expect(res.body.results[1].san).toBe('g5');
    expect(res.body.results[2].san).toBe('Nf3');
  });

  it('returns book false for unknown positions, malformed uci, and illegal moves', async () => {
    const res = await loopback(buildApp(), 'POST', '/api/openings/book-moves', {
      moves: [
        { fen: fensFor(['g4'])[1], uci: 'e2e4' }, // position not the book's start, SAN not book anyway
        { fen: START_FEN, uci: 'e2' }, // malformed uci
        { fen: START_FEN, uci: 'e2e9' }, // illegal move
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.results.map((result) => result.book)).toEqual([false, false, false]);
    expect(res.body.results.map((result) => result.san)).toEqual([null, null, null]);
  });

  it('returns 400 when moves is missing or empty', async () => {
    const missing = await loopback(buildApp(), 'POST', '/api/openings/book-moves', {});
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/moves/i);

    const empty = await loopback(buildApp(), 'POST', '/api/openings/book-moves', { moves: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/moves/i);
  });

  it('returns 400 when the batch exceeds the request cap', async () => {
    const moves = Array.from({ length: 65 }, () => ({ fen: START_FEN, uci: 'e2e4' }));
    const res = await loopback(buildApp(), 'POST', '/api/openings/book-moves', { moves });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 64/i);
  });
});
