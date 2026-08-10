import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';

import openingRoutes from './openings.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/openings', openingRoutes);
  return app;
}

function loopback(app, method, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        { host: '127.0.0.1', port, path, method },
        (res) => {
          let buf = '';
          res.on('data', (chunk) => (buf += chunk));
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body: JSON.parse(buf) })));
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

describe('GET /api/openings', () => {
  it('returns opening roots with eco, name, fen, empty san, and stats', async () => {
    const res = await loopback(buildApp(), 'GET', '/api/openings');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.openings.length).toBe(res.body.count);

    const opening = res.body.openings[0];
    expect(opening).toHaveProperty('eco');
    expect(opening).toHaveProperty('name');
    expect(opening).toHaveProperty('fen');
    expect(opening.san).toBe('');
  });
});

describe('GET /api/openings/children', () => {
  it('returns legal child moves and book position for a known fen', async () => {
    const app = buildApp();
    const rootsRes = await loopback(app, 'GET', '/api/openings');
    const sicilian = rootsRes.body.openings.find((opening) => opening.name === 'Sicilian Defence');

    const res = await loopback(
      app,
      'GET',
      `/api/openings/children?fen=${encodeURIComponent(sicilian.fen)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.children.length).toBeGreaterThan(0);
    for (const child of res.body.children) {
      expect(child.san).toBeTruthy();
      expect(child.reachable).toBe(true);
      expect(child).toHaveProperty('fen');
      expect(child).toHaveProperty('stats');
    }
    expect(res.body.position.name).toBe('Sicilian Defence');
  });

  it('returns an empty children array for an unknown position fen', async () => {
    const res = await loopback(
      buildApp(),
      'GET',
      `/api/openings/children?fen=${encodeURIComponent('8/8/8/8/8/8/8/8 w - - 0 1')}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.children).toEqual([]);
    expect(res.body.position).toBeNull();
  });

  it('returns 400 when fen is missing', async () => {
    const res = await loopback(buildApp(), 'GET', '/api/openings/children');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fen/i);
  });
});

describe('GET /api/openings/search', () => {
  it('finds openings by name/eco substring, case-insensitive', async () => {
    const res = await loopback(buildApp(), 'GET', '/api/openings/search?q=najdorf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.results[0].name).toMatch(/najdorf/i);
  });

  it('returns an empty results array for unmatched queries', async () => {
    const res = await loopback(buildApp(), 'GET', '/api/openings/search?q=zzzz');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toEqual([]);
  });

  it('returns 400 when q is missing', async () => {
    const res = await loopback(buildApp(), 'GET', '/api/openings/search');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/q/i);
  });
});
