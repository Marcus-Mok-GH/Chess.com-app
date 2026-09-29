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
});
