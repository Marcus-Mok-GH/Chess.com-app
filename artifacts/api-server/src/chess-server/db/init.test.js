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

// Every non-test source file under the API server source (the DDL must cover
// the tables all of them query). Scans TypeScript as well as JavaScript so a
// query added to a .ts entry point cannot slip past the completeness check.
function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(full));
    else if (
      /\.(js|ts|tsx|mjs|cjs)$/.test(entry.name) &&
      !/\.test\.[jt]sx?$/.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

// Definitions inside a CREATE TABLE body that name a constraint rather than a
// column, so the leading word must not be mistaken for a column name.
const TABLE_CONSTRAINT_KEYWORDS = new Set([
  'primary',
  'foreign',
  'unique',
  'check',
  'constraint',
  'exclude',
  'like',
]);

/** Splits a parenthesized SQL body on its top-level commas. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Finds each `<pattern>(` in `text` and returns the balanced contents of that
 * paren. Depth counting is required because column definitions contain their
 * own parens (`VARCHAR(100)`, `REFERENCES users(id)`).
 */
function parenBlocks(text, pattern) {
  const blocks = [];
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    let depth = 1;
    let index = pattern.lastIndex;
    while (index < text.length && depth > 0) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') depth -= 1;
      index += 1;
    }
    if (depth === 0) blocks.push({ table: match[1], body: text.slice(pattern.lastIndex, index - 1) });
  }
  return blocks;
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

  it('defines the per-time-control rating columns on every full DDL run', async () => {
    // Blitz, rapid, classical, and unlimited keep independent ratings. If any
    // pool column were dropped, results would silently stop persisting.
    await initDatabase();

    const texts = queries.map((q) => q.text);
    const usersTable = texts.find((t) => t.includes('CREATE TABLE IF NOT EXISTS users'));
    expect(usersTable).toBeTruthy();
    expect(usersTable).toContain('rapid_elo INTEGER DEFAULT 1200');
    expect(usersTable).toContain('classical_elo INTEGER DEFAULT 1200');
    expect(usersTable).toContain('blitz_elo INTEGER DEFAULT 1200');
    expect(usersTable).toContain('bullet_elo INTEGER DEFAULT 1200');
    // Pre-existing installs are backfilled.
    for (const column of ['bullet_elo', 'blitz_elo', 'rapid_elo', 'classical_elo']) {
      expect(
        texts.some((t) => t.includes(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column}`)),
      ).toBe(true);
    }
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
    // SQL keywords are uppercase in this codebase, which is what keeps this
    // extraction precise: the name after FROM/INTO/JOIN/UPDATE is a lowercase
    // identifier, so an uppercase keyword can never be mistaken for a table. A
    // statement that breaks the convention would hide its table from this
    // guard, so non-uppercase keywords are collected and failed on below.
    const tableRe = /\b(FROM|INTO|JOIN|UPDATE)\s+([a-z_][a-z0-9_]*)/g;
    const opensWithLowercaseVerb = /^['"`]\s*(select|insert|update|delete|with)\b/;
    const lowercaseKeyword = /\b(from|into|join|update|set|values|where)\b/;

    const referenced = new Set();
    const lowercaseSql = [];
    for (const file of collectSourceFiles(sourceRoot)) {
      const text = readFileSync(file, 'utf8');
      let literalMatch;
      stringRe.lastIndex = 0;
      while ((literalMatch = stringRe.exec(text)) !== null) {
        const literal = literalMatch[0];
        const hasUppercaseKeyword = /\b(SELECT|INSERT|UPDATE|DELETE|JOIN|FROM)\b/.test(literal);
        if (!hasUppercaseKeyword) {
          // Not a statement this guard can read. If it opens like SQL anyway,
          // flag it so the convention (and with it the guard) stays intact.
          if (opensWithLowercaseVerb.test(literal)) {
            lowercaseSql.push(`${path.relative(sourceRoot, file)}: ${literal.slice(0, 60)}`);
          }
          continue;
        }
        // Strip `${...}` interpolations so a JS variable named `values` (or a
        // placeholder) is not read as a lowercase SQL keyword.
        const sqlText = literal.replace(/\$\{[^}]*\}/g, ' ');
        // A keyword in the wrong case would slip past the extraction below.
        if (lowercaseKeyword.test(sqlText)) {
          lowercaseSql.push(`${path.relative(sourceRoot, file)}: ${literal.slice(0, 60)}`);
        }
        let tableMatch;
        tableRe.lastIndex = 0;
        while ((tableMatch = tableRe.exec(sqlText)) !== null) {
          referenced.add(tableMatch[2].toLowerCase());
        }
      }
    }

    // Keep the extractor honest: if this drops, the regex stopped matching SQL.
    expect(referenced.size).toBeGreaterThan(10);
    // The guard must notice SQL that is not uppercase, or a lowercase query
    // would bypass the table scan and reach production without a CREATE TABLE.
    // Uppercase the offending query rather than deleting this assertion —
    // otherwise its tables go unchecked.
    const sampleLowercaseSql = "select id from some_future_table where id = $1";
    expect(opensWithLowercaseVerb.test(`'${sampleLowercaseSql}'`)).toBe(true);
    expect(lowercaseSql).toEqual([]);
    // The scan must cover the TypeScript entry points too (app.ts/index.ts), or
    // SQL there would silently bypass this guard.
    const scanned = collectSourceFiles(sourceRoot);
    expect(scanned.some((file) => file.endsWith('.ts'))).toBe(true);
    // ...and it must reach the server's top-level entry points, not just
    // chess-server/. If the scan root were ever narrowed, a table queried only
    // from app.ts/index.ts/vercel.ts would be created nowhere and fail at
    // runtime; this keeps that from passing silently.
    for (const entry of ['app.ts', 'index.ts', 'vercel.ts']) {
      expect(
        scanned.some((file) => path.relative(sourceRoot, file) === entry),
      ).toBe(true);
    }

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

  it('creates every column the server inserts, so a missing column cannot 500 in production', async () => {
    // Companion to the table guard above. The 42703 self-heal in query.js
    // re-runs this DDL, so it can only fix a missing column that the DDL
    // actually defines; a column that was never added here fails, triggers a
    // repair that does not add it, and fails again — a permanent 500 rather
    // than a one-time one. INSERT column lists are checked because they are
    // unambiguous and are how new columns normally reach the database.
    const sourceRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..'
    );

    await initDatabase();
    const ddl = queries.map((q) => q.text).join('\n');

    // Columns the DDL defines: CREATE TABLE bodies plus the additive backfill.
    const defined = new Map();
    const define = (table, column) => {
      const key = table.toLowerCase();
      if (!defined.has(key)) defined.set(key, new Set());
      defined.get(key).add(column.toLowerCase());
    };
    for (const { table, body } of parenBlocks(ddl, /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
      for (const part of splitTopLevel(body)) {
        const name = part.trim().split(/\s+/)[0]?.toLowerCase();
        if (name && !TABLE_CONSTRAINT_KEYWORDS.has(name)) define(table, name);
      }
    }
    const alterRe = /ALTER TABLE\s+([a-z_][a-z0-9_]*)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi;
    for (const match of ddl.matchAll(alterRe)) define(match[1], match[2]);

    // Keep the extractor honest: if these drop, the parser stopped working.
    expect(defined.get('users')?.has('classical_elo')).toBe(true);
    expect(defined.get('users')?.has('blitz_elo')).toBe(true);
    expect(defined.get('users')?.has('bullet_elo')).toBe(true);
    expect(defined.get('games')?.has('white_elo')).toBe(true);

    // Columns the server actually writes.
    const missing = [];
    let inserts = 0;
    for (const file of collectSourceFiles(sourceRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const { table, body } of parenBlocks(text, /INSERT INTO\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
        const columns = splitTopLevel(body).map((part) => part.trim());
        // Anything that is not a plain identifier list (dynamic SQL, an
        // INSERT ... SELECT) is not a column list we can check.
        if (!columns.length || !columns.every((name) => /^[a-z_][a-z0-9_]*$/i.test(name))) continue;
        inserts += 1;
        const known = defined.get(table.toLowerCase());
        for (const column of columns) {
          if (!known?.has(column.toLowerCase())) {
            missing.push(`${table}.${column} (${path.relative(sourceRoot, file)})`);
          }
        }
      }
    }

    expect(inserts).toBeGreaterThan(10);
    expect(missing.sort()).toEqual([]);
  });

  it('creates every foreign-key target before the table referencing it, so a fresh database bootstraps', async () => {
    // The whole DDL runs in one transaction. On an empty database (a new
    // environment, or a first deploy) an inline REFERENCES to a table created
    // further down aborts that transaction, so nothing is created at all and
    // the self-heal retries the same doomed order — a total outage rather than
    // one bad endpoint. Existing databases hide this, because the target table
    // is already there from a previous run.
    await initDatabase();
    const ddl = queries.map((q) => q.text).join('\n');

    const blocks = parenBlocks(ddl, /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi);
    const order = blocks.map((block) => block.table.toLowerCase());
    expect(order).toContain('users');

    const problems = [];
    let references = 0;
    blocks.forEach(({ table, body }, index) => {
      for (const match of body.matchAll(/REFERENCES\s+([a-z_][a-z0-9_]*)/gi)) {
        references += 1;
        const target = match[1].toLowerCase();
        const targetIndex = order.indexOf(target);
        if (targetIndex === -1) problems.push(`${table} -> ${target} (never created)`);
        else if (targetIndex > index) problems.push(`${table} -> ${target} (created later)`);
      }
    });

    // Keep the extractor honest: if this drops, the scan stopped finding FKs.
    expect(references).toBeGreaterThan(5);
    expect(problems.sort()).toEqual([]);
  });

  it('creates every table before the same DDL alters or indexes it, so a fresh database bootstraps', async () => {
    // The whole DDL runs inside one transaction. On an empty database (a new
    // environment or first deploy) an `ALTER TABLE` / `CREATE INDEX ... ON`
    // that names a table this DDL never creates — or that sits above its own
    // `CREATE TABLE` — throws 42P01 and aborts the transaction, so *nothing*
    // is created and the stored version is never written. The per-query
    // self-heal then replays the same doomed sequence: a boot-time outage for
    // every endpoint rather than one bad request. The FROM/INTO/JOIN/UPDATE
    // guard above cannot see these statements at all, so this pins their
    // targets and their order.
    await initDatabase();

    const created = new Map(); // table -> index of the statement that created it
    const problems = [];
    let mutations = 0;

    queries.forEach(({ text }, index) => {
      const create = text.match(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/i);
      if (create) created.set(create[1].toLowerCase(), index);

      const targets = [];
      for (const pattern of [
        /\bALTER TABLE\s+([a-z_][a-z0-9_]*)/i,
        /\bCREATE\s+(?:UNIQUE\s+)?INDEX[\s\S]*?\bON\s+([a-z_][a-z0-9_]*)/i,
        /\bDROP TABLE(?:\s+IF EXISTS)?\s+([a-z_][a-z0-9_]*)/i,
        /\bTRUNCATE(?:\s+TABLE)?\s+([a-z_][a-z0-9_]*)/i,
      ]) {
        const match = text.match(pattern);
        if (match) targets.push(match[1]);
      }

      for (const target of targets) {
        mutations += 1;
        const createdIndex = created.get(target.toLowerCase());
        if (createdIndex === undefined) problems.push(`${target} (never created)`);
        else if (createdIndex > index) problems.push(`${target} (created later)`);
      }
    });

    // Keep the extractor honest: if these drop, the scan stopped matching DDL.
    expect(mutations).toBeGreaterThan(30);
    expect(created.size).toBeGreaterThan(20);
    expect(created.has('users')).toBe(true);
    expect(problems.sort()).toEqual([]);
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
