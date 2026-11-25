import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  getSessionToken: vi.fn(() => 'test-token'),
  validateSession: vi.fn(),
}));

vi.mock('../services/antiCheatService.js', () => ({
  isIntegrityReviewer: vi.fn(),
}));

import { query } from '../db.js';
import { validateSession } from '../auth.js';
import { isIntegrityReviewer } from '../services/antiCheatService.js';
import botsRoutes from './bots.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const NEW_MODELS = [
  'z-ai/glm-5.3-flash',
  'deepseek/deepseek-v4.1-flash',
  'community/scriptsnsenses-sys/gpt-6-luna:free',
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/bots', botsRoutes);
  return app;
}

function loopback(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const hasBody = body !== undefined && method !== 'GET';
      const data = hasBody ? JSON.stringify(body) : '';
      const headers = { Authorization: 'Bearer test-token' };
      if (hasBody) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(data);
      }
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => server.close(() => {
            let parsed;
            try { parsed = JSON.parse(buf); } catch { parsed = buf; }
            resolve({ status: res.statusCode, body: parsed });
          }));
        }
      );
      req.on('error', (e) => server.close(() => reject(e)));
      if (hasBody) req.write(data);
      req.end();
    });
  });
}

function botPayload(model) {
  return {
    username: 'nimble_knight',
    email: 'nimble@example.com',
    password: 'secret-password',
    name: 'Nimble Knight',
    personality: 'Friendly',
    systemPrompt: 'Play sharply.',
    model,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  validateSession.mockResolvedValue(ADMIN_ID);
  isIntegrityReviewer.mockReturnValue(true);
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bot model validation', () => {
  it.each(NEW_MODELS)('accepts %s when creating a bot', async (model) => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM users')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO users')) {
        return { rows: [{ id: 'bot-user-1', username: 'nimble_knight' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO bots')) {
        return { rows: [{ id: 'nimble-knight-1', name: 'Nimble Knight', model }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await loopback(buildApp(), 'POST', '/api/bots', botPayload(model));

    expect(res.status).toBe(201);
    const botInsert = query.mock.calls.find((call) => call[0].includes('INSERT INTO bots'));
    expect(botInsert[1]).toContain(model);
  });

  it('rejects an unknown model when updating a bot', async () => {
    const res = await loopback(buildApp(), 'PATCH', '/api/bots/nimble-knight-1', {
      model: 'not-a-real-model',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid model');
  });

  it.each(NEW_MODELS)('accepts %s when updating a bot', async (model) => {
    query.mockResolvedValue({ rows: [{ id: 'nimble-knight-1', name: 'Nimble Knight', model }], rowCount: 1 });

    const res = await loopback(buildApp(), 'PATCH', '/api/bots/nimble-knight-1', { model });

    expect(res.status).toBe(200);
    const update = query.mock.calls.find((call) => call[0].includes('UPDATE bots'));
    expect(update[1]).toContain(model);
  });
});

describe('bot route authorisation', () => {
  it('rejects sessions that are not integrity reviewers', async () => {
    validateSession.mockResolvedValue(USER_ID);
    isIntegrityReviewer.mockReturnValue(false);

    const res = await loopback(buildApp(), 'POST', '/api/bots', botPayload(NEW_MODELS[0]));

    expect(res.status).toBe(403);
  });
});
