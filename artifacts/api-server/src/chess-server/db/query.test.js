import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pool.js', () => ({
  getPool: vi.fn(),
  shouldClosePool: false,
}));

vi.mock('./status.js', () => ({
  isDatabaseReady: vi.fn(() => true),
  setDatabaseReady: vi.fn(),
  ensureDatabaseReady: vi.fn(async (init) => {
    await init();
    return true;
  }),
}));

vi.mock('./init.js', () => ({
  initDatabase: vi.fn(async () => {}),
}));

import { getPool } from './pool.js';
import { setDatabaseReady } from './status.js';
import { initDatabase } from './init.js';
import { query, withTransaction } from './query.js';

const undefinedColumn = () => Object.assign(new Error('column "time_control" does not exist'), { code: '42703' });
const undefinedTable = () => Object.assign(new Error('relation "active_games" does not exist'), { code: '42P01' });
const otherError = () => Object.assign(new Error('deadlock detected'), { code: '40P01' });

let pool;

function transactionClient() {
  return {
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pool = {
    query: vi.fn(),
    connect: vi.fn(async () => transactionClient()),
    end: vi.fn(async () => {}),
  };
  getPool.mockReturnValue(pool);
});

describe('query schema self-heal', () => {
  it('recreates a missing column and retries the query', async () => {
    pool.query
      .mockRejectedValueOnce(undefinedColumn())
      .mockResolvedValueOnce({ rows: [{ ok: true }], rowCount: 1 });

    const result = await query('UPDATE active_games SET time_control = $1', ['rapid']);

    expect(result.rows).toEqual([{ ok: true }]);
    expect(initDatabase).toHaveBeenCalledWith({ force: true });
    expect(setDatabaseReady).toHaveBeenCalledWith(false);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('recreates a missing table and retries the query', async () => {
    pool.query
      .mockRejectedValueOnce(undefinedTable())
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await query('SELECT * FROM active_games');

    expect(initDatabase).toHaveBeenCalledWith({ force: true });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('does not run DDL for unrelated errors', async () => {
    pool.query.mockRejectedValueOnce(otherError());

    await expect(query('SELECT 1')).rejects.toThrow('deadlock');
    expect(initDatabase).not.toHaveBeenCalled();
  });

  it('surfaces the original error when the schema cannot be repaired', async () => {
    const { ensureDatabaseReady } = await import('./status.js');
    ensureDatabaseReady.mockResolvedValueOnce(false);
    pool.query.mockRejectedValueOnce(undefinedColumn());

    await expect(query('SELECT * FROM active_games')).rejects.toThrow('does not exist');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('withTransaction schema self-heal', () => {
  it('repairs the schema and retries the transaction once', async () => {
    const firstClient = transactionClient();
    const secondClient = transactionClient();
    pool.connect
      .mockResolvedValueOnce(firstClient)
      .mockResolvedValueOnce(secondClient);

    const callback = vi
      .fn()
      .mockRejectedValueOnce(undefinedColumn())
      .mockResolvedValueOnce('created');

    const result = await withTransaction(callback);

    expect(result).toBe('created');
    expect(callback).toHaveBeenCalledTimes(2);
    expect(initDatabase).toHaveBeenCalledWith({ force: true });
    // The failed attempt is rolled back and its client released before retrying.
    expect(firstClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(firstClient.release).toHaveBeenCalled();
    expect(secondClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('does not retry unrelated failures', async () => {
    const callback = vi.fn().mockRejectedValue(otherError());

    await expect(withTransaction(callback)).rejects.toThrow('deadlock');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(initDatabase).not.toHaveBeenCalled();
  });

  it('rolls back and releases the client on failure', async () => {
    const client = transactionClient();
    pool.connect.mockResolvedValueOnce(client);

    await expect(
      withTransaction(vi.fn().mockRejectedValue(otherError())),
    ).rejects.toThrow('deadlock');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects a non-function callback without touching the pool', async () => {
    await expect(withTransaction(null)).rejects.toBeInstanceOf(TypeError);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
