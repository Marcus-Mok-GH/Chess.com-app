import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'production';
process.env.VERCEL = '1';

const { default: app } = await import('./index.js');

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

test('unknown API routes return JSON 404 instead of the frontend index', async () => {
  const response = await loopback('/api/matchmaking/queue');

  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), {
    error: { message: 'API endpoint not found.' },
  });
});

test('API root returns JSON 404 in the Vercel runtime', async () => {
  const response = await loopback('/api/');

  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), {
    error: { message: 'API endpoint not found.' },
  });
});
