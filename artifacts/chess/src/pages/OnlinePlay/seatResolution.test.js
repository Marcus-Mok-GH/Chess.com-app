import { describe, expect, it } from 'vitest';
import { resolveOnlinePlayerSeat } from './seatResolution';

describe('resolveOnlinePlayerSeat', () => {
  it('uses the exact session ID before account-level fallback', () => {
    const game = {
      white_player_id: 'user_42_white-session',
      black_player_id: 'user_42_black-session',
    };

    expect(resolveOnlinePlayerSeat(game, ['user_42_black-session', 'user_42'])).toEqual({
      color: 'black',
      playerId: 'user_42_black-session',
    });
  });

  it('resolves legacy prefixed and bare account IDs', () => {
    expect(resolveOnlinePlayerSeat({
      white_player_id: '42',
      black_player_id: 'user_99',
    }, ['user_42'])).toEqual({
      color: 'white',
      playerId: '42',
    });
  });

  it('does not guess when account-level matching is ambiguous', () => {
    expect(resolveOnlinePlayerSeat({
      white_player_id: 'user_42_white-session',
      black_player_id: 'user_42_black-session',
    }, ['user_42'])).toBeNull();
  });
});
