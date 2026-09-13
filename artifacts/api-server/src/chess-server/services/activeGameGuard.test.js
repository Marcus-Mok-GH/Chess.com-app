import { describe, expect, it, vi } from 'vitest';
import {
  accountIdForPlayer,
  activeGameMatchesAccount,
  findActiveGameForAccount,
} from './activeGameGuard.js';

describe('activeGameGuard', () => {
  it('normalizes session-suffixed player ids to one account', () => {
    const uuid = 'be827321-f624-4051-a300-63c7a52f128e';
    expect(accountIdForPlayer(uuid)).toBe(uuid);
    expect(accountIdForPlayer(`user_${uuid}_session-a`)).toBe(uuid);
  });

  it('recognizes an account in either active-game seat', () => {
    const uuid = 'be827321-f624-4051-a300-63c7a52f128e';
    expect(activeGameMatchesAccount({ white_player_id: `user_${uuid}_tab-a`, black_player_id: 'other' }, uuid)).toBe(true);
    expect(activeGameMatchesAccount({ white_player_id: 'other', black_player_id: `user_${uuid}_tab-b` }, uuid)).toBe(true);
    expect(activeGameMatchesAccount({ white_player_id: 'other', black_player_id: 'third' }, uuid)).toBe(false);
  });

  it('finds only playing and waiting games and supports excluding one game', async () => {
    const uuid = 'be827321-f624-4051-a300-63c7a52f128e';
    const client = {
      query: vi.fn(async () => ({ rows: [
        { game_id: 'WAITING', status: 'waiting', white_player_id: `user_${uuid}_old`, black_player_id: null },
        { game_id: 'ENDED', status: 'ended', white_player_id: uuid, black_player_id: null },
      ] })),
    };

    expect(await findActiveGameForAccount(client, uuid)).toMatchObject({ game_id: 'WAITING' });
    expect(await findActiveGameForAccount(client, uuid, { excludeGameId: 'WAITING' })).toBeNull();
  });
});
