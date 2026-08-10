import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(),
}));

import { query } from '../db.js';
import { authenticatedUserId } from '../coachAuth.js';
import { LESSON_CATALOG } from '../lessons/lessonCatalog.js';

let lessonRoutes;

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function loopback(app, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const hasBody = body !== undefined && method !== 'GET';
      const data = hasBody ? JSON.stringify(body) : '';
      const reqHeaders = {};
      if (hasBody) {
        reqHeaders['content-type'] = 'application/json';
        reqHeaders['content-length'] = Buffer.byteLength(data);
      }
      Object.assign(reqHeaders, headers);
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers: reqHeaders },
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

beforeEach(async () => {
  vi.resetAllMocks();
  lessonRoutes = (await import('./lessons.js')).default;
});

describe('GET /api/lessons', () => {
  it('returns the public catalog ordered by lesson order', async () => {
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'GET', '/api/lessons');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(LESSON_CATALOG.length);
    expect(res.body.lessons.map((lesson) => lesson.id)).toEqual(
      LESSON_CATALOG.map((lesson) => lesson.id)
    );
  });

  it('returns a single lesson by id and 404s for unknown ids', async () => {
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const found = await loopback(app, 'GET', '/api/lessons/forks');
    expect(found.status).toBe(200);
    expect(found.body.lesson.id).toBe('forks');

    const missing = await loopback(app, 'GET', '/api/lessons/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatch(/not found/i);
  });
});

describe('lesson progress endpoints', () => {
  it('requires authentication to read progress', async () => {
    authenticatedUserId.mockResolvedValue(null);
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'GET', '/api/lessons/progress');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/log in/i);
  });

  it('returns the caller progress for an authenticated user', async () => {
    authenticatedUserId.mockResolvedValue(42);
    query.mockResolvedValue({
      rows: [{ lesson_id: 'forks', completed: true, score: 5, completed_at: null }],
    });
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'GET', '/api/lessons/progress');

    expect(res.status).toBe(200);
    expect(res.body.progress).toEqual([
      { lessonId: 'forks', completed: true, score: 5, completedAt: null },
    ]);
  });

  it('requires authentication to save progress', async () => {
    authenticatedUserId.mockResolvedValue(null);
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'POST', '/api/lessons/forks/progress', {
      completed: true,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/log in/i);
  });

  it('rejects a non-boolean completed value', async () => {
    authenticatedUserId.mockResolvedValue(42);
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'POST', '/api/lessons/forks/progress', {
      completed: 'yes',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boolean/i);
  });

  it('404s when saving progress for an unknown lesson', async () => {
    authenticatedUserId.mockResolvedValue(42);
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'POST', '/api/lessons/does-not-exist/progress', {
      completed: true,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('saves progress for an authenticated user and returns it', async () => {
    authenticatedUserId.mockResolvedValue(42);
    query.mockResolvedValue({
      rows: [{ lesson_id: 'forks', completed: true, score: null, completed_at: null }],
    });
    const app = buildApp();
    app.use('/api/lessons', lessonRoutes);

    const res = await loopback(app, 'POST', '/api/lessons/forks/progress', {
      completed: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.progress.lessonId).toBe('forks');
    expect(res.body.progress.completed).toBe(true);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO lesson_progress');
    expect(sql).toContain('ON CONFLICT');
  });
});
