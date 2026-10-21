import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREMOVE_PROMOTION,
  createPremove,
  isPremoveLegal,
  premoveTargets,
} from './premoves';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// White has just played 1.e4, so it is Black's turn.
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('createPremove', () => {
  it('normalizes a valid premove and defaults the promotion to queen', () => {
    expect(createPremove('e2', 'e4')).toEqual({ from: 'e2', to: 'e4', promotion: 'q' });
  });

  it('lowercases a supplied promotion and rejects unknown pieces', () => {
    expect(createPremove('a7', 'a8', 'R')).toEqual({ from: 'a7', to: 'a8', promotion: 'r' });
    expect(createPremove('a7', 'a8', 'k')).toEqual({
      from: 'a7',
      to: 'a8',
      promotion: DEFAULT_PREMOVE_PROMOTION,
    });
  });

  it('rejects malformed or empty premoves', () => {
    expect(createPremove(undefined, 'e4')).toBeNull();
    expect(createPremove('e2', null)).toBeNull();
    expect(createPremove('e', 'e4')).toBeNull();
    expect(createPremove('e2', 'e2')).toBeNull();
  });
});

describe('premoveTargets', () => {
  it('previews the player\'s own piece moves even on the opponent\'s turn', () => {
    // It is Black's turn, but White's e-pawn should still offer premove targets.
    expect(premoveTargets(AFTER_E4_FEN, 'w', 'e4')).toContain('e5');
  });

  it('returns no targets for the opponent\'s pieces or an empty square', () => {
    expect(premoveTargets(AFTER_E4_FEN, 'w', 'e7')).toEqual([]);
    expect(premoveTargets(AFTER_E4_FEN, 'w', 'd5')).toEqual([]);
  });

  it('returns an empty list for invalid input', () => {
    expect(premoveTargets('', 'w', 'e2')).toEqual([]);
    expect(premoveTargets(AFTER_E4_FEN, 'x', 'e4')).toEqual([]);
    expect(premoveTargets('not a fen', 'w', 'e2')).toEqual([]);
  });
});

describe('isPremoveLegal', () => {
  it('accepts a legal premove for the side to move', () => {
    expect(isPremoveLegal(START_FEN, { from: 'e2', to: 'e4', promotion: 'q' })).toBe(true);
  });

  it('rejects a premove that is illegal in the resulting position', () => {
    // Pinned/blocked or simply not that piece's move.
    expect(isPremoveLegal(START_FEN, { from: 'e2', to: 'e5', promotion: 'q' })).toBe(false);
    // No black piece can move to b3 from the start.
    expect(isPremoveLegal(START_FEN, { from: 'b8', to: 'b3', promotion: 'q' })).toBe(false);
  });

  it('rejects illegal or missing input', () => {
    expect(isPremoveLegal('', { from: 'e2', to: 'e4' })).toBe(false);
    expect(isPremoveLegal(START_FEN, null)).toBe(false);
  });
});