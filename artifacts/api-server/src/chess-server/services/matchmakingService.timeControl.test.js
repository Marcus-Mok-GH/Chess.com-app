import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('./activeGameGuard.js', () => ({
  accountIdForPlayer: (pid) => {
    if (!pid || typeof pid !== 'string') return null;
    const m = pid.match(/^user_(\d+)/);
    return m ? m[1] : null;
  },
  findActiveGameForAccount: vi.fn(),
  lockAccounts: vi.fn(),
}));

import { query } from '../db.js';
import { MatchmakingService } from './matchmakingService.js';

function queuePlayer(overrides = {}) {
  return {
    id: 1,
    socket_id: 'polling-1',
    player_id: 'user_1',
    player_name: 'Alice',
    elo: 1200,
    is_ranked: true,
    time_control: 'rapid',
    joined_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MatchmakingService time-control pairing', () => {
  it('does not pair a timed player with an untimed one', async () => {
    const queue = [
      queuePlayer({ id: 1, player_id: 'user_1', time_control: 'rapid' }),
      queuePlayer({ id: 2, player_id: 'user_2', time_control: 'unlimited' }),
    ];
    query.mockResolvedValue({ rows: queue, rowCount: 0 });

    const service = new MatchmakingService({ enableLoop: false });
    const createMatch = vi.spyOn(service, 'createMatch').mockResolvedValue(true);

    await service.processMatchmaking();

    expect(createMatch).not.toHaveBeenCalled();
  });

  it('pairs players who share a time control', async () => {
    const queue = [
      queuePlayer({ id: 1, player_id: 'user_1', time_control: 'rapid' }),
      queuePlayer({ id: 2, player_id: 'user_2', time_control: 'rapid', elo: 1250 }),
    ];
    query.mockResolvedValue({ rows: queue, rowCount: 0 });

    const service = new MatchmakingService({ enableLoop: false });
    const createMatch = vi.spyOn(service, 'createMatch').mockResolvedValue(true);

    await service.processMatchmaking();

    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(createMatch.mock.calls[0][0].player_id).toBe('user_1');
    expect(createMatch.mock.calls[0][1].player_id).toBe('user_2');
  });

  it('treats a missing time control as untimed', async () => {
    const queue = [
      queuePlayer({ id: 1, player_id: 'user_1', time_control: undefined }),
      queuePlayer({ id: 2, player_id: 'user_2', time_control: 'rapid' }),
    ];
    query.mockResolvedValue({ rows: queue, rowCount: 0 });

    const service = new MatchmakingService({ enableLoop: false });
    const createMatch = vi.spyOn(service, 'createMatch').mockResolvedValue(true);

    await service.processMatchmaking();

    expect(createMatch).not.toHaveBeenCalled();
  });

  it('processes each time control as its own pool', async () => {
    const queue = [
      queuePlayer({ id: 1, player_id: 'user_1', time_control: 'rapid' }),
      queuePlayer({ id: 2, player_id: 'user_2', time_control: 'rapid', elo: 1210 }),
      queuePlayer({ id: 3, player_id: 'user_3', time_control: 'unlimited' }),
      queuePlayer({ id: 4, player_id: 'user_4', time_control: 'unlimited', elo: 1190 }),
    ];
    // The pool-scoped read returns only the rows for the requested control.
    query.mockImplementation(async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('SELECT * FROM matchmaking_queue')) {
        const pool = params?.[0];
        return { rows: queue.filter((p) => p.time_control === pool), rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const service = new MatchmakingService({ enableLoop: false });
    const createMatch = vi.spyOn(service, 'createMatch').mockResolvedValue(true);

    await service.processMatchmaking();

    // One pair in each pool, and never a pair that spans controls.
    expect(createMatch).toHaveBeenCalledTimes(2);
    for (const [a, b] of createMatch.mock.calls) {
      expect(a.time_control).toBe(b.time_control);
    }
    expect(createMatch.mock.calls.map(([a]) => a.time_control).sort()).toEqual([
      'rapid',
      'unlimited',
    ]);

    // A pool-scoped read was issued once per known control.
    const reads = query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('SELECT * FROM matchmaking_queue')
    );
    expect(reads.map(([, params]) => params[0]).sort()).toEqual([
      'blitz',
      'blitz_3_2',
      'bullet',
      'classical',
      'classical_30_5',
      'rapid',
      'rapid_10_3',
      'unlimited',
    ]);
  });

  it('keeps classical 30+0 and classical 30+5 in separate pools', async () => {
    const queue = [
      queuePlayer({ id: 1, player_id: 'user_1', time_control: 'classical' }),
      queuePlayer({ id: 2, player_id: 'user_2', time_control: 'classical_30_5', elo: 1220 }),
      queuePlayer({ id: 3, player_id: 'user_3', time_control: 'classical_30_5', elo: 1180 }),
    ];
    query.mockImplementation(async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('SELECT * FROM matchmaking_queue')) {
        const pool = params?.[0];
        return { rows: queue.filter((p) => p.time_control === pool), rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const service = new MatchmakingService({ enableLoop: false });
    const createMatch = vi.spyOn(service, 'createMatch').mockResolvedValue(true);

    await service.processMatchmaking();

    // Only the two 30+5 players pair; the lone 30+0 player never crosses over.
    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(createMatch.mock.calls[0][0].time_control).toBe('classical_30_5');
    expect(createMatch.mock.calls[0][1].time_control).toBe('classical_30_5');
  });

  it('keeps rapid 10+0 and rapid 10+3 in separate pools', async () => {
    const queue = [
      queuePlayer({ id: 1, player_id: 'user_1', time_control: 'rapid' }),
      queuePlayer({ id: 2, player_id: 'user_2', time_control: 'rapid_10_3', elo: 1220 }),
      queuePlayer({ id: 3, player_id: 'user_3', time_control: 'rapid_10_3', elo: 1180 }),
    ];
    // The pool-scoped read returns only the rows for the requested control.
    query.mockImplementation(async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('SELECT * FROM matchmaking_queue')) {
        const pool = params?.[0];
        return { rows: queue.filter((p) => p.time_control === pool), rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const service = new MatchmakingService({ enableLoop: false });
    const createMatch = vi.spyOn(service, 'createMatch').mockResolvedValue(true);

    await service.processMatchmaking();

    // Only the two 10+3 players pair; the lone 10+0 player never crosses over.
    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(createMatch.mock.calls[0][0].time_control).toBe('rapid_10_3');
    expect(createMatch.mock.calls[0][1].time_control).toBe('rapid_10_3');
  });
});
