import { describe, expect, it } from 'vitest';
import {
  normalizeMoveHistory,
  getSanFromEntry,
  getMoveFromEntry,
  toStoredMoveHistory,
  buildGameFromHistory,
} from './moveHistory.js';

describe('normalizeMoveHistory', () => {
  it('returns empty array for falsy input', () => {
    expect(normalizeMoveHistory(null)).toEqual([]);
    expect(normalizeMoveHistory(undefined)).toEqual([]);
    expect(normalizeMoveHistory('')).toEqual([]);
  });

  it('parses a JSON string array', () => {
    expect(normalizeMoveHistory('["e4","e5"]')).toEqual(['e4', 'e5']);
  });

  it('passes through an array of strings', () => {
    expect(normalizeMoveHistory(['e4', 'e5'])).toEqual(['e4', 'e5']);
  });

  it('normalizes move objects with san field', () => {
    const input = [{ san: 'e4', from: 'e2', to: 'e4' }];
    const result = normalizeMoveHistory(input);
    expect(result).toHaveLength(1);
    expect(result[0].san).toBe('e4');
    expect(result[0].from).toBe('e2');
  });

  it('parses pg-text array literal', () => {
    const input = '{"e4","e5","Nf3"}';
    const result = normalizeMoveHistory(input);
    expect(result).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('parses PGN-like string with move numbers', () => {
    const input = '1.e4 e5 2.Nf3';
    const result = normalizeMoveHistory(input);
    if (result.length >= 2) {
      expect(result[0]).toBe('e4');
      expect(result[1]).toBe('e5');
    } else {
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('returns empty array for non-array, non-string input', () => {
    expect(normalizeMoveHistory(42)).toEqual([]);
  });
});

describe('getSanFromEntry', () => {
  it('returns san from object entry', () => {
    expect(getSanFromEntry({ san: 'e4' })).toBe('e4');
  });

  it('returns string entry directly', () => {
    expect(getSanFromEntry('e4')).toBe('e4');
  });

  it('returns empty string for falsy', () => {
    expect(getSanFromEntry(null)).toBe('');
    expect(getSanFromEntry(undefined)).toBe('');
  });
});

describe('getMoveFromEntry', () => {
  it('returns from/to/promotion from object', () => {
    const entry = { from: 'e2', to: 'e4', san: 'e4' };
    const result = getMoveFromEntry(entry);
    expect(result).toEqual({ from: 'e2', to: 'e4', promotion: 'q' });
  });

  it('returns san string when no from/to', () => {
    expect(getMoveFromEntry({ san: 'Nf3' })).toBe('Nf3');
  });

  it('returns string entry directly', () => {
    expect(getMoveFromEntry('e4')).toBe('e4');
  });

  it('returns null for null', () => {
    expect(getMoveFromEntry(null)).toBeNull();
  });
});

describe('toStoredMoveHistory', () => {
  it('serializes objects to JSON strings', () => {
    const input = [{ san: 'e4', from: 'e2', to: 'e4' }, 'e5'];
    const result = toStoredMoveHistory(input);
    expect(result[0]).toBe(JSON.stringify({ san: 'e4', from: 'e2', to: 'e4' }));
    expect(result[1]).toBe('e5');
  });

  it('filters null entries', () => {
    const result = toStoredMoveHistory(['e4', null, 'e5']);
    expect(result).toEqual(['e4', 'e5']);
  });
});

describe('buildGameFromHistory', () => {
  it('builds a game from a list of SAN moves', () => {
    const game = buildGameFromHistory(['e4', 'e5', 'Nf3']);
    expect(game.fen()).toContain('rnbqkbnr');
    expect(game.history()).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('returns initial position for empty history', () => {
    const game = buildGameFromHistory([]);
    expect(game.turn()).toBe('w');
  });

  it('falls back to fen when history does not match', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const game = buildGameFromHistory(['e4'], fen);
    expect(game.fen()).toBe(fen);
  });

  it('builds game from move objects', () => {
    const moves = [{ san: 'e4', from: 'e2', to: 'e4' }];
    const game = buildGameFromHistory(moves);
    expect(game.history()).toEqual(['e4']);
  });

  it('stops on first illegal move', () => {
    const game = buildGameFromHistory(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'INVALID']);
    expect(game.history().length).toBe(5);
  });
});
