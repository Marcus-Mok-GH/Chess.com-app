import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';

vi.mock('../../db.js', () => ({ query: vi.fn() }));
vi.mock('../profanity.js', () => ({ censorMessage: (m) => m }));

const mockGetGame = vi.fn();
const mockUpdateGameStateCAS = vi.fn().mockResolvedValue(undefined);
const mockEndGame = vi.fn();
vi.mock('../gameService.js', () => ({
  getGameService: () => ({
    getGame: mockGetGame,
    updateGameStateCAS: mockUpdateGameStateCAS,
    endGame: mockEndGame,
    persistGameSnapshot: vi.fn(),
  }),
}));

vi.mock('../utils.js', () => ({
  verifyPlayerAuth: vi.fn(),
  resolveMatchMoveOwner: vi.fn(),
  buildPlayerMoveHistory: vi.fn(() => []),
}));

let setupGameHandlers;
const loadModule = async () => {
  const mod = await import('./gameHandlers.js');
  setupGameHandlers = mod.setupGameHandlers;
};

const PLAYING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function createMockSocket(id = 'socket-1') {
  const emitted = [];
  const handlers = {};
  return {
    id,
    emitted,
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn((event, data) => { emitted.push({ event, ...data }); }),
    _trigger(event, data) { return handlers[event]?.(data); },
    _handlers: handlers,
  };
}

function createMockIo() {
  return {
    to: vi.fn(() => ({ emit: vi.fn() })),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await loadModule();
});

const VALID_GAME = {
  game_id: 'GAME1',
  status: 'playing',
  fen: PLAYING_FEN,
  move_history: [],
  move_count: 0,
  white_player_id: 'user_1',
  black_player_id: 'user_2',
  white_socket_id: 'socket-1',
  black_socket_id: 'socket-2',
  white_player_name: 'Alice',
  black_player_name: 'Bob',
  game_mode: 'ranked',
};

describe('make_move handler — move_error includes gameId', () => {
  it('includes gameId on invalid game ID validation', async () => {
    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    socket._trigger('make_move', { gameId: 123, playerId: 'p1', moveHistory: ['e4'] });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe(123);
  });

  it('includes gameId on invalid player ID validation', async () => {
    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    socket._trigger('make_move', { gameId: 'GAME1', playerId: '', moveHistory: ['e4'] });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
  });

  it('includes gameId on invalid move history validation', async () => {
    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    socket._trigger('make_move', { gameId: 'GAME1', playerId: 'user_1', moveHistory: null });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
  });

  it('includes gameId when game not found', async () => {
    mockGetGame.mockResolvedValue(null);
    const { verifyPlayerAuth } = await import('../utils.js');

    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    await socket._trigger('make_move', { gameId: 'GAME1', playerId: 'user_1', moveHistory: ['e4'] });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
    expect(err.message).toBe('Game not found or not active');
  });

  it('includes gameId on authorization failure', async () => {
    mockGetGame.mockResolvedValue({ ...VALID_GAME });
    const { verifyPlayerAuth } = await import('../utils.js');
    verifyPlayerAuth.mockReturnValue({ valid: false, error: 'Unauthorized - not your game' });

    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    await socket._trigger('make_move', { gameId: 'GAME1', playerId: 'user_1', moveHistory: ['e4'] });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
    expect(err.message).toBe('Unauthorized - not your game');
  });

  it('includes gameId on wrong turn', async () => {
    mockGetGame.mockResolvedValue({ ...VALID_GAME });
    const { verifyPlayerAuth } = await import('../utils.js');
    verifyPlayerAuth.mockReturnValue({ valid: true, color: 'black' });

    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    await socket._trigger('make_move', { gameId: 'GAME1', playerId: 'user_2', moveHistory: ['e4'] });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
  });

  it('includes gameId on stale CAS', async () => {
    mockGetGame.mockResolvedValue({ ...VALID_GAME });
    const { verifyPlayerAuth } = await import('../utils.js');
    verifyPlayerAuth.mockReturnValue({ valid: true, color: 'white' });

    mockUpdateGameStateCAS.mockResolvedValueOnce(null);

    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    await socket._trigger('make_move', {
      gameId: 'GAME1',
      playerId: 'user_1',
      moveHistory: [{ from: 'e2', to: 'e4', san: 'e4', promotion: undefined }],
    });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
  });

  it('includes gameId on catch/exception path', async () => {
    const badGame = { ...VALID_GAME, fen: 'not-a-valid-fen w - - 0 1' };
    mockGetGame.mockResolvedValue(badGame);
    const { verifyPlayerAuth } = await import('../utils.js');
    verifyPlayerAuth.mockReturnValue({ valid: true, color: 'white' });

    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    await socket._trigger('make_move', {
      gameId: 'GAME1',
      playerId: 'user_1',
      moveHistory: [{ from: 'e2', to: 'e4', san: 'e4', promotion: undefined }],
    });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
  });

  it('includes gameId on illegal move', async () => {
    mockGetGame.mockResolvedValue({ ...VALID_GAME });
    const { verifyPlayerAuth } = await import('../utils.js');
    verifyPlayerAuth.mockReturnValue({ valid: true, color: 'white' });

    const socket = createMockSocket();
    const io = createMockIo();
    setupGameHandlers(io, socket);

    await socket._trigger('make_move', {
      gameId: 'GAME1',
      playerId: 'user_1',
      moveHistory: ['d5'],
    });

    const err = socket.emitted.find((e) => e.event === 'move_error');
    expect(err).toBeDefined();
    expect(err.gameId).toBe('GAME1');
  });
});
