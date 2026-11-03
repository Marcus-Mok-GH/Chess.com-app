import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';

vi.mock('../db.js', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('./activeGameGuard.js', () => ({ lockAccounts: vi.fn(), findActiveGameForAccount: vi.fn() }));
vi.mock('./gameService.js', () => ({ getGameService: vi.fn() }));
vi.mock('../kv/onlineGameKv.js', () => ({ getOnlineGameKv: vi.fn() }));
vi.mock('../routes/engine.js', () => ({ computeManagedBotMove: vi.fn() }));

import { query, withTransaction } from '../db.js';
import { findActiveGameForAccount } from './activeGameGuard.js';
import { getGameService } from './gameService.js';
import { getOnlineGameKv } from '../kv/onlineGameKv.js';
import { computeManagedBotMove } from '../routes/engine.js';
import { queueAvailableBot, playManagedBotTurn } from './managedBots.js';

const start = new Chess().fen();

beforeEach(() => {
  vi.resetAllMocks();
  getGameService.mockReturnValue({ persistGameSnapshot: vi.fn(), endGame: vi.fn() });
  getOnlineGameKv.mockReturnValue({ set: vi.fn() });
  withTransaction.mockImplementation((fn) => fn({ query: vi.fn()
    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    .mockResolvedValue({ rows: [] }) }));
});

describe('managed bots', () => {
  it('only queues opted-in active public bots and uses a valid queue shape', async () => {
    query.mockResolvedValue({ rows: [{ id: 'bot-1', name: 'Test Bot', elo: 1300 }] });
    findActiveGameForAccount.mockResolvedValue(null);
    const joined = await queueAvailableBot('rapid', true, 'human-1', 1200);
    expect(joined).toBe(true);
    expect(query.mock.calls[0][0]).toContain('b.auto_join_matches = TRUE');
    expect(query.mock.calls[0][0]).toContain('b.is_public = TRUE');
    expect(withTransaction).toHaveBeenCalledTimes(1);
    const clientQuery = vi.fn().mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }).mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation((fn) => fn({ query: clientQuery }));
    await queueAvailableBot('rapid', true, 'human-1', 1200);
    const [, args] = clientQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO matchmaking_queue'));
    expect(args).toEqual(['bot-bot-1', 'bot-1', 'Test Bot', 1300, true, 'rapid']);
  });

  it('never enters an already occupied bot into the queue', async () => {
    query.mockResolvedValue({ rows: [{ id: 'bot-1', name: 'Test Bot', elo: 1300 }] });
    findActiveGameForAccount.mockImplementation(async (_client, id) => id === 'bot-1' ? { game_id: 'OTHER' } : null);
    expect(await queueAvailableBot('rapid', true, 'human-1', 1200)).toBe(false);
  });

  it('does not queue a bot when the human has left', async () => {
    query.mockResolvedValue({ rows: [{ id: 'bot-1', name: 'Test Bot', elo: 1300 }] });
    withTransaction.mockImplementation((fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
    expect(await queueAvailableBot('rapid', true, 'human-1', 1200)).toBe(false);
  });

  it('leaves a human-turn game unchanged', async () => {
    const game = { game_id: 'GAME1', status: 'playing', fen: start, white_player_id: 'human', black_player_id: 'bot' };
    query.mockResolvedValue({ rows: [] });
    expect(await playManagedBotTurn(game)).toBe(game);
    expect(computeManagedBotMove).not.toHaveBeenCalled();
  });

  it('returns a completed bot game even if activity logging fails', async () => {
    const chess = new Chess();
    chess.load('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
    const game = { game_id: 'GAME1', status: 'playing', fen: chess.fen(), move_count: 0,
      move_history: [], white_player_id: 'bot', black_player_id: 'human', time_control: 'unlimited' };
    query.mockResolvedValueOnce({ rows: [{ id: 'bot', elo: 1200 }] });
    computeManagedBotMove.mockResolvedValue('f7g7');
    const saved = { ...game, move_count: 1, fen: 'after' };
    query.mockResolvedValueOnce({ rows: [saved] });
    getGameService().endGame.mockResolvedValue({ ...saved, status: 'ended' });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockRejectedValueOnce(new Error('activity unavailable'));
    query.mockResolvedValueOnce({ rows: [{ ...saved, status: 'ended', result: 'white' }] });
    expect((await playManagedBotTurn(game)).status).toBe('ended');
    expect(getGameService().endGame).toHaveBeenCalledWith('GAME1', 'white');
  });

  it('makes one CAS-protected bot move and persists a client-readable history', async () => {
    const chess = new Chess();
    chess.move('e4');
    const game = { game_id: 'GAME1', status: 'playing', fen: chess.fen(), move_count: 1,
      move_history: [JSON.stringify({ san: 'e4', from: 'e2', to: 'e4' })],
      white_player_id: 'human', black_player_id: 'bot', time_control: 'unlimited' };
    query.mockResolvedValueOnce({ rows: [{ id: 'bot', elo: 1200 }] });
    computeManagedBotMove.mockResolvedValue('e7e5');
    const saved = { ...game, move_count: 2, fen: new Chess().fen() };
    query.mockResolvedValueOnce({ rows: [saved] });
    query.mockResolvedValue({ rows: [] });
    expect(await playManagedBotTurn(game)).toBe(saved);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain("move_count = $4 AND status = 'playing'");
    expect(params[3]).toBe(1);
    expect(JSON.parse(params[1][1]).san).toBe('e5');
    expect(getGameService().persistGameSnapshot).toHaveBeenCalledWith(saved, null, 'active');
    expect(getOnlineGameKv().set).toHaveBeenCalledWith('GAME1', saved);
  });
});
