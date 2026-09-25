import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pool.js', () => ({
  getDirectPool: vi.fn(),
  getPool: vi.fn(),
  shouldClosePool: false,
}));

vi.mock('../lessons/lessonCatalog.js', () => ({
  LESSON_CATALOG: [
    {
      id: 'lesson-1',
      title: 'Forks',
      topic: 'Tactics',
      difficulty: 'beginner',
      order: 1,
      content: 'A fork attacks two pieces at once.',
    },
  ],
}));

import { getDirectPool } from './pool.js';
import { initDatabase } from './init.js';

let queries;
let client;

function clientResultFor(text) {
  if (/^SELECT value FROM schema_meta/i.test(text)) {
    return { rows: client.schemaVersion ? [{ value: client.schemaVersion }] : [] };
  }
  return { rows: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  client = {
    schemaVersion: null,
    query: vi.fn(async (text, params) => {
      queries.push({ text, params });
      if (/^INSERT INTO schema_meta/i.test(text)) client.schemaVersion = '2';
      return clientResultFor(text);
    }),
    release: vi.fn(),
  };
  getDirectPool.mockReturnValue({
    connect: vi.fn(async () => client),
    end: vi.fn(async () => {}),
  });
});

describe('initDatabase schema version fast path', () => {
  it('skips all DDL when the stored schema version is current', async () => {
    client.schemaVersion = '2';

    await initDatabase();

    const texts = queries.map((q) => q.text);
    expect(texts).toContain('SELECT value FROM schema_meta WHERE key = $1 LIMIT 1');
    expect(texts.some((t) => t.includes('BEGIN'))).toBe(false);
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(false);
  });

  it('runs the full DDL and stores the version when none is stored', async () => {
    await initDatabase();

    const texts = queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('BEGIN'))).toBe(true);
    expect(texts.some((t) => t.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
    expect(texts.some((t) => t.includes('COMMIT'))).toBe(true);
    expect(texts.some((t) => t.includes('INSERT INTO schema_meta'))).toBe(true);
  });

  it('sets a lock timeout so schema work never queues forever', async () => {
    await initDatabase();

    expect(queries.some((q) => /^SET lock_timeout = /i.test(q.text))).toBe(true);
  });

  it('skips DDL after taking the advisory lock when another instance migrated first', async () => {
    // First read (before BEGIN) sees no version; the re-check after the
    // advisory lock sees the version written by a concurrent instance.
    let readCount = 0;
    client.query = vi.fn(async (text, params) => {
      queries.push({ text, params });
      if (/^SELECT value FROM schema_meta/i.test(text)) {
        readCount += 1;
        const version = readCount >= 2 ? '2' : null;
        return { rows: version ? [{ value: version }] : [] };
      }
      return clientResultFor(text);
    });

    await initDatabase();

    const texts = queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(false);
    expect(texts.some((t) => t.includes('COMMIT'))).toBe(true);
  });

  it('runs the full DDL even when the version is current when forced', async () => {
    client.schemaVersion = '2';

    await initDatabase({ force: true });

    const texts = queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('BEGIN'))).toBe(true);
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
  });

  it('rolls back and releases the client when DDL fails', async () => {
    client.query = vi.fn(async (text, params) => {
      queries.push({ text, params });
      if (/^SELECT value FROM schema_meta/i.test(text)) return { rows: [] };
      if (text.includes('CREATE EXTENSION')) throw new Error('boom');
      return { rows: [] };
    });

    await expect(initDatabase()).rejects.toThrow('boom');
    expect(client.release).toHaveBeenCalled();
    const texts = queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('ROLLBACK'))).toBe(true);
  });
});
