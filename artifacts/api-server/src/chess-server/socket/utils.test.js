import { describe, expect, it } from 'vitest';
import { verifyPlayerAuth, resolveMatchMoveOwner, userIdFromPlayerId } from './utils.js';

describe('verifyPlayerAuth', () => {
  const makeSocket = (id) => ({ id });

  it('authenticates white player by socket id', () => {
    const game = { white_socket_id: 's1', black_socket_id: 's2', white_player_id: 'user_1', black_player_id: 'user_2' };
    const result = verifyPlayerAuth(makeSocket('s1'), game, 'user_1');
    expect(result).toEqual({ valid: true, color: 'white' });
  });

  it('authenticates black player by socket id', () => {
    const game = { white_socket_id: 's1', black_socket_id: 's2', white_player_id: 'user_1', black_player_id: 'user_2' };
    const result = verifyPlayerAuth(makeSocket('s2'), game, 'user_2');
    expect(result).toEqual({ valid: true, color: 'black' });
  });

  it('rejects unknown socket', () => {
    const game = { white_socket_id: 's1', black_socket_id: 's2', white_player_id: 'user_1', black_player_id: 'user_2' };
    const result = verifyPlayerAuth(makeSocket('s3'), game, 'user_1');
    expect(result.valid).toBe(false);
  });

  it('normalizes user_uuid vs user_uuid_suffix for white player', () => {
    const game = { white_socket_id: 's1', black_socket_id: null, white_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e', black_player_id: null };
    const result = verifyPlayerAuth(makeSocket('s1'), game, 'user_be827321-f624-4051-a300-63c7a52f128e_extra');
    expect(result).toEqual({ valid: true, color: 'white' });
  });

  it('normalizes user_uuid vs bare uuid for black player', () => {
    const game = { white_socket_id: null, black_socket_id: 's2', white_player_id: null, black_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e' };
    const result = verifyPlayerAuth(makeSocket('s2'), game, 'be827321-f624-4051-a300-63c7a52f128e');
    expect(result).toEqual({ valid: true, color: 'black' });
  });

  it('rejects mismatched normalized ids for white', () => {
    const game = { white_socket_id: 's1', black_socket_id: null, white_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e', black_player_id: null };
    const result = verifyPlayerAuth(makeSocket('s1'), game, 'user_c0ffee55-dead-4000-a000-000000000000');
    expect(result.valid).toBe(false);
  });
});

describe('resolveMatchMoveOwner', () => {
  it('resolves by socket id for white', () => {
    const game = { white_socket_id: 's1', black_socket_id: 's2', white_player_id: 'u1', black_player_id: 'u2', white_player_name: 'Alice', black_player_name: 'Bob' };
    const result = resolveMatchMoveOwner(game, 's1', 'u1');
    expect(result).toEqual({ username: 'Alice', isWhite: true });
  });

  it('resolves by normalized player id when socket does not match', () => {
    const game = { white_socket_id: 's_other', black_socket_id: 's_other2', white_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e', black_player_id: 'user_c0ffee55-dead-4000-a000-000000000000', white_player_name: 'Alice', black_player_name: 'Bob' };
    const result = resolveMatchMoveOwner(game, 's_unknown', 'be827321-f624-4051-a300-63c7a52f128e');
    expect(result).toEqual({ username: 'Alice', isWhite: true });
  });

  it('returns null when nothing matches', () => {
    const game = { white_socket_id: 's1', black_socket_id: 's2', white_player_id: 'u1', black_player_id: 'u2', white_player_name: 'A', black_player_name: 'B' };
    const result = resolveMatchMoveOwner(game, 's3', 'u3');
    expect(result).toEqual({ username: null, isWhite: null });
  });
});

describe('userIdFromPlayerId', () => {
  it('extracts numeric from user_N', () => {
    expect(userIdFromPlayerId('user_42')).toBe(42);
  });

  it('extracts uuid from user_uuid', () => {
    expect(userIdFromPlayerId('user_be827321-f624-4051-a300-63c7a52f128e')).toBe('be827321-f624-4051-a300-63c7a52f128e');
  });

  it('extracts uuid from user_uuid_suffix', () => {
    expect(userIdFromPlayerId('user_be827321-f624-4051-a300-63c7a52f128e_abc')).toBe('be827321-f624-4051-a300-63c7a52f128e');
  });

  it('returns bare uuid as-is', () => {
    expect(userIdFromPlayerId('be827321-f624-4051-a300-63c7a52f128e')).toBe('be827321-f624-4051-a300-63c7a52f128e');
  });

  it('returns null for invalid input', () => {
    expect(userIdFromPlayerId(null)).toBeNull();
    expect(userIdFromPlayerId('')).toBeNull();
    expect(userIdFromPlayerId('guest_abc')).toBeNull();
  });
});
