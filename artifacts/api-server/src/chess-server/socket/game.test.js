import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameService } from './game.js';
import { query } from '../db.js';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

const createIo = () => ({
  to: vi.fn(() => ({ emit: vi.fn() })),
});

const calculateNewElo = (playerElo, opponentElo, score) => {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(playerElo + 32 * (score - expectedScore));
};

describe('GameService.updatePlayerElos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates ELO for both players when IDs are user_*', async () => {
    const service = new GameService(createIo());
    query.mockResolvedValue({ rows: [], rowCount: 1 });

    const game = {
      white_player_id: 'user_10',
      black_player_id: 'user_12',
      white_elo: 1200,
      black_elo: 1400,
      white_socket_id: 'socket-white',
      black_socket_id: 'socket-black',
    };

    await service.updatePlayerElos(game, 'white');

    expect(query).toHaveBeenCalledTimes(2);

    const whiteParams = query.mock.calls[0][1];
    const blackParams = query.mock.calls[1][1];

    expect(whiteParams[4]).toBe(10);
    expect(blackParams[4]).toBe(12);

    const expectedWhite = calculateNewElo(1200, 1400, 1);
    const expectedBlack = calculateNewElo(1400, 1200, 0);

    expect(whiteParams[0]).toBe(expectedWhite);
    expect(blackParams[0]).toBe(expectedBlack);
  });

  it('skips updates when ELOs are missing', async () => {
    const service = new GameService(createIo());

    await service.updatePlayerElos({
      white_player_id: 'user_1',
      black_player_id: 'user_2',
      white_elo: null,
      black_elo: 1200,
    }, 'white');

    expect(query).not.toHaveBeenCalled();
  });

  it('skips updates when player IDs are not linked to users', async () => {
    const service = new GameService(createIo());

    await service.updatePlayerElos({
      white_player_id: 'guest_abc',
      black_player_id: 'user_2',
      white_elo: 1200,
      black_elo: 1200,
    }, 'white');

    expect(query).not.toHaveBeenCalled();
  });
});

describe('GameService.endGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores numeric user IDs when persisting games', async () => {
    const service = new GameService(createIo());

    const gameRow = {
      game_id: 'GAME123',
      white_player_id: 'user_7',
      black_player_id: 'user_8',
      white_player_name: 'Alice',
      black_player_name: 'Bob',
      result: 'white',
      fen: 'fen',
      move_history: ['e4'],
      game_mode: 'friendly',
    };

    query
      .mockResolvedValueOnce({ rows: [gameRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await service.endGame('GAME123', 'white');

    expect(query).toHaveBeenCalledTimes(2);

    const insertParams = query.mock.calls[1][1];
    expect(insertParams[1]).toBe(7);
    expect(insertParams[2]).toBe(8);
  });
});

describe('GameService.updateGameStateCAS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates fen and increments move_count when expected count matches', async () => {
    const service = new GameService(createIo());
    const updatedGame = {
      game_id: 'GAME1', fen: 'new-fen', move_history: ['e4', 'e5'],
      move_count: 1, status: 'playing', game_mode: 'ranked',
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'A', black_player_name: 'B',
    };
    query
      .mockResolvedValueOnce({ rows: [updatedGame], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await service.updateGameStateCAS('GAME1', 'new-fen', ['e4', 'e5'], 0);

    expect(result).toEqual(updatedGame);
    expect(query).toHaveBeenCalledTimes(2);
    const updateSql = query.mock.calls[0][0];
    expect(updateSql).toContain('move_count = move_count + 1');
    expect(updateSql).toContain('WHERE game_id = $3 AND move_count = $4');
    const params = query.mock.calls[0][1];
    expect(params).toEqual(['new-fen', ['e4', 'e5'], 'GAME1', 0]);
  });

  it('returns null when CAS condition fails (concurrent move)', async () => {
    const service = new GameService(createIo());
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.updateGameStateCAS('GAME1', 'stale-fen', ['e4'], 0);

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns null when game status is not playing', async () => {
    const service = new GameService(createIo());
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.updateGameStateCAS('GAME1', 'new-fen', ['e4'], 5);

    expect(result).toBeNull();
  });
});
