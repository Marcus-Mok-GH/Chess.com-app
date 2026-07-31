import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

process.env.NODE_ENV = 'production';
process.env.VERCEL = '1';

let app;

beforeAll(async () => {
  const mod = await import('./index.js');
  app = mod.default;
});

function loopback(path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'GET',
          headers: { accept: 'application/json' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

describe('Vercel API routes', () => {
  it('unknown API routes return JSON 404 instead of the frontend index', async () => {
    const response = await loopback('/api/matchmaking/queue');

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      error: { message: 'API endpoint not found.' },
    });
  });

  it('API root returns JSON 404 in the Vercel runtime', async () => {
    const response = await loopback('/api/');

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      error: { message: 'API endpoint not found.' },
    });
  });
});
