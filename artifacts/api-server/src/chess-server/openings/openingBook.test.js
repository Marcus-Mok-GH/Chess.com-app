import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  START_FEN,
  getRoots,
  getPosition,
  legalChildren,
  searchOpenings,
} from './openingBook.js';

describe('opening book roots', () => {
  it('exposes roots with valid ECO codes, non-empty names, and empty san', () => {
    const roots = getRoots();
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(root.eco).toMatch(/^[A-E]\d{2}$/);
      expect(root.name).toBeTruthy();
      expect(root.san).toBe('');
    }
  });

  it('every root fen is a legal chess.js position', () => {
    for (const root of getRoots()) {
      expect(() => new Chess(root.fen)).not.toThrow();
    }
  });

  it('covers the major openings from the spec', () => {
    const names = getRoots().map((root) => root.name);
    const expected = [
      "King's Gambit",
      "Queen's Gambit",
      'Ruy Lopez',
      'Italian Game',
      'Sicilian Defence',
      'French Defence',
      'Caro-Kann Defence',
      'Scandinavian Defence',
      'English Opening',
      'London System',
      'Indian Defence',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('root stats are plausible totals the UI can render as percentages', () => {
    for (const root of getRoots()) {
      if (!root.stats) continue;
      const { moves, whiteWins, draws, blackWins } = root.stats;
      expect(moves).toBeGreaterThanOrEqual(0);
      expect(whiteWins).toBeGreaterThanOrEqual(0);
      expect(draws).toBeGreaterThanOrEqual(0);
      expect(blackWins).toBeGreaterThanOrEqual(0);
      expect(whiteWins + draws + blackWins).toBeLessThanOrEqual(moves);
    }
  });
});

describe('legalChildren', () => {
  it('returns legal first moves for the starting position', () => {
    const children = legalChildren(START_FEN);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(child.reachable).toBe(true);
      const chess = new Chess(START_FEN);
      expect(() => chess.move(child.san)).not.toThrow();
      expect(child.fen).toBe(chess.fen());
    }
  });

  it('returns legal continuations for a known named position', () => {
    const sicilian = getRoots().find((root) => root.name === 'Sicilian Defence');
    const children = legalChildren(sicilian.fen);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      const chess = new Chess(sicilian.fen);
      expect(() => chess.move(child.san)).not.toThrow();
      expect(child.fen).toBe(chess.fen());
    }
  });

  it('returns an empty array for unknown or malformed fens', () => {
    expect(legalChildren('8/8/8/8/8/8/8/8 w - - 0 1')).toEqual([]);
    expect(legalChildren('not a fen')).toEqual([]);
    expect(legalChildren('')).toEqual([]);
  });
});

describe('searchOpenings', () => {
  it('matches case-insensitively by name', () => {
    const results = searchOpenings('NAJDORF');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain('Najdorf');
  });

  it('matches case-insensitively by ECO code', () => {
    const results = searchOpenings('b90');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.eco === 'B90')).toBe(true);
  });

  it('returns an empty array for unmatched queries', () => {
    expect(searchOpenings('zzzz-no-such-opening')).toEqual([]);
    expect(searchOpenings('')).toEqual([]);
  });
});

describe('getPosition', () => {
  it('returns book metadata for a known fen', () => {
    const queenGambit = getRoots().find((root) => root.name === "Queen's Gambit");
    const position = getPosition(queenGambit.fen);
    expect(position).not.toBeNull();
    expect(position.name).toBe("Queen's Gambit");
    expect(position.eco).toBe('D06');
  });

  it('returns null for unknown or malformed fens', () => {
    expect(getPosition('not a fen')).toBeNull();
    expect(getPosition('8/8/8/8/8/8/8/8 w - - 0 1')).toBeNull();
  });
});
