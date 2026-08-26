import { describe, it, expect, beforeEach } from 'vitest';
import { saveLocalGame, loadLocalGame, clearLocalGame } from './gamePersistence';

describe('gamePersistence - Pass & Play', () => {
  const testGameId = 'TEST_PASS_PLAY';

  beforeEach(() => {
    clearLocalGame(testGameId);
  });

  it('saves and loads Pass & Play game parameters', () => {
    const state = {
      gameId: testGameId,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveHistory: [],
      gameMode: 'pass_and_play',
      whiteName: 'Alice',
      blackName: 'Bob',
      autoRotate: true,
      playerColor: 'w',
      boardOrientation: 'white',
      result: 'in_progress',
    };

    const saved = saveLocalGame(state);
    expect(saved).toBe(true);

    const loaded = loadLocalGame(testGameId);
    expect(loaded).toBeDefined();
    expect(loaded.gameMode).toBe('pass_and_play');
    expect(loaded.whiteName).toBe('Alice');
    expect(loaded.blackName).toBe('Bob');
    expect(loaded.autoRotate).toBe(true);
  });
});
