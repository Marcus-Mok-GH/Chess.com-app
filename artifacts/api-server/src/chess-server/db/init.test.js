import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { initDatabase, SCHEMA_VERSION } from './init.js';

let queries;
let client;

function clientResultFor(text) {
  if (/^SELECT value FROM schema_meta/i.test(text)) {
    return { rows: client.schemaVersion ? [{ value: client.schemaVersion }] : [] };
  }
  return { rows: [] };
}

// Every non-test .js file under the API server source (the DDL must cover the
// tables all of them query).
function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(full));
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) files.push(full);
  }
  return files;
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  client = {
    schemaVersion: null,
    query: vi.fn(async (text, params) => {
      queries.push({ text, params });
      if (/^INSERT INTO schema_meta/i.test(text)) client.schemaVersion = SCHEMA_VERSION;
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
    client.schemaVersion = SCHEMA_VERSION;

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
        const version = readCount >= 2 ? SCHEMA_VERSION : null;
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
    client.schemaVersion = SCHEMA_VERSION;

    await initDatabase({ force: true });

    const texts = queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('BEGIN'))).toBe(true);
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
  });

  it('creates the per-user puzzle stats table (with rating) on every full DDL run', async () => {
    // The puzzles page persists solved/streak/rating through puzzle_stats;
    // the schema bootstrap must always define it or Elo silently stops
    // persisting (the query self-heal would recreate it only on failure).
    await initDatabase();

    const texts = queries.map((q) => q.text);
    const puzzleStatsTable = texts.find((t) => t.includes('CREATE TABLE IF NOT EXISTS puzzle_stats'));
    expect(puzzleStatsTable).toBeTruthy();
    expect(puzzleStatsTable).toContain('user_id VARCHAR(100) PRIMARY KEY');
    expect(puzzleStatsTable).toContain('rating INTEGER NOT NULL DEFAULT 400');
    // Pre-existing installs get backfilled columns even if their table
    // predates them.
    expect(texts.some((t) => t.includes('ALTER TABLE puzzle_stats ADD COLUMN IF NOT EXISTS rating'))).toBe(true);
    // The lesson scheme tables the puzzles page reads alongside stats.
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS lessons'))).toBe(true);
    expect(texts.some((t) => t.includes('CREATE TABLE IF NOT EXISTS lesson_progress'))).toBe(true);
  });

  it('defines the online-game clock columns on every full DDL run', async () => {
    // Rapid mode reads and writes these columns on every move, create, and
    // join. If a schema edit ever dropped them, timed games would fail for
    // every player until the query self-heal kicked in.
    await initDatabase();

    const texts = queries.map((q) => q.text);
    const activeGamesTable = texts.find((t) => t.includes('CREATE TABLE IF NOT EXISTS active_games'));
    expect(activeGamesTable).toBeTruthy();
    expect(activeGamesTable).toContain('time_control VARCHAR(20)');
    expect(activeGamesTable).toContain('white_time_ms INTEGER');
    expect(activeGamesTable).toContain('black_time_ms INTEGER');
    expect(activeGamesTable).toContain('clock_running_since TIMESTAMP');
    expect(activeGamesTable).toContain('end_reason VARCHAR(30)');

    // Pre-existing installs are backfilled column by column.
    for (const column of ['time_control', 'white_time_ms', 'black_time_ms', 'clock_running_since', 'end_reason']) {
      expect(
        texts.some((t) => t.includes(`ALTER TABLE active_games ADD COLUMN IF NOT EXISTS ${column}`)),
      ).toBe(true);
    }
    // Queue rows created before selectable time controls existed are healed too.
    expect(
      texts.some((t) => t.includes('ALTER TABLE matchmaking_queue ADD COLUMN IF NOT EXISTS time_control')),
    ).toBe(true);
  });

  it('defines the per-time-control rating column on every full DDL run', async () => {
    // Rapid and unlimited keep independent ratings. If this column is ever
    // dropped, rapid results would silently stop persisting.
    await initDatabase();

    const texts = queries.map((q) => q.text);
    const usersTable = texts.find((t) => t.includes('CREATE TABLE IF NOT EXISTS users'));
    expect(usersTable).toBeTruthy();
    expect(usersTable).toContain('rapid_elo INTEGER DEFAULT 1200');
    // Pre-existing installs are backfilled.
    expect(
      texts.some((t) => t.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS rapid_elo')),
    ).toBe(true);
  });

  it('bumps the schema version so existing databases actually receive new DDL', async () => {
    // A stored version equal to the code's version skips DDL entirely, so any
    // schema addition MUST come with a bump or production never gets it
    // (relying on the per-query self-heal means a guaranteed first failure).
    expect(Number(SCHEMA_VERSION)).toBeGreaterThan(2);
  });

  it('creates every table the server queries, so a missing table cannot 500 in production', async () => {
    // The schema self-heal in query.js can only repair tables this DDL knows
    // about, so a query against a table that was never added here would crash
    // production. Extract table names from SQL string literals (SQL keywords
    // are uppercase in this codebase) so prose comments are ignored.
    const sourceRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..'
    );
    const stringRe = /`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
    const tableRe = /\b(FROM|INTO|JOIN|UPDATE)\s+([a-z_][a-z0-9_]*)/g;

    const referenced = new Set();
    for (const file of collectSourceFiles(sourceRoot)) {
      const text = readFileSync(file, 'utf8');
      let literalMatch;
      stringRe.lastIndex = 0;
      while ((literalMatch = stringRe.exec(text)) !== null) {
        const literal = literalMatch[0];
        if (!/\b(SELECT|INSERT|UPDATE|DELETE|JOIN|FROM)\b/.test(literal)) continue;
        let tableMatch;
        tableRe.lastIndex = 0;
        while ((tableMatch = tableRe.exec(literal)) !== null) {
          referenced.add(tableMatch[2].toLowerCase());
        }
      }
    }

    // Keep the extractor honest: if this drops, the regex stopped matching SQL.
    expect(referenced.size).toBeGreaterThan(10);

    await initDatabase();
    const ddl = queries.map((q) => q.text).join('\n');
    const created = new Set(
      [...ddl.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((m) =>
        m[1].toLowerCase()
      )
    );

    const missing = [...referenced].filter((table) => !created.has(table)).sort();
    expect(missing).toEqual([]);
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
