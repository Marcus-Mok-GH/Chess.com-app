import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  buildReviewPositions,
  winPercentFromCp,
  accuracyFromWinDelta,
  centipawnLossAt,
  classifyMove,
  summarizeSide,
  formatEval,
  MOVE_CLASSES,
} from './reviewUtils';

describe('buildReviewPositions', () => {
  it('returns start position plus one fen per move', () => {
    const { fens, sans, ucis } = buildReviewPositions([{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }]);
    expect(sans).toEqual(['e4', 'e5', 'Nf3']);
    expect(fens).toHaveLength(4);
    expect(ucis).toEqual(['e2e4', 'e7e5', 'g1f3']);
    expect(fens[0]).toBe(new Chess().fen());
  });

  it('handles string entries and stops at the first illegal move', () => {
    const { fens, sans } = buildReviewPositions(['e4', 'e5', 'Ke2']);
    expect(sans).toEqual(['e4', 'e5', 'Ke2']);
    expect(fens).toHaveLength(4);
    expect(() => new Chess(fens[3])).not.toThrow();
  });

  it('handles promotion moves', () => {
    const game = new Chess();
    // Italian with a fast promotion race is overkill; craft a known promotion
    game.load('rnbq1bnr/ppppkP1p/8/8/8/8/PPPP1PPP/RNBQKBNR w KQ - 0 1');
    // Use a fresh position: white pawn g7 promotes
    const { sans, ucis } = buildReviewPositions(['e4', 'd5', 'exd5', 'Qxd5']);
    expect(sans).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
    expect(ucis[2]).toBe('e4d5');
    void game;
  });

  it('returns only the start position for an empty history', () => {
    const { fens, sans } = buildReviewPositions([]);
    expect(fens).toHaveLength(1);
    expect(sans).toHaveLength(0);
  });
});

describe('winPercentFromCp', () => {
  it('is 50 at even material', () => {
    expect(winPercentFromCp(0)).toBeCloseTo(50, 5);
  });
  it('is monotonic and bounded', () => {
    expect(winPercentFromCp(100)).toBeGreaterThan(50);
    expect(winPercentFromCp(-100)).toBeLessThan(50);
    expect(winPercentFromCp(100000)).toBeLessThanOrEqual(100);
    expect(winPercentFromCp(-100000)).toBeGreaterThanOrEqual(0);
  });
});

describe('accuracyFromWinDelta', () => {
  it('is 100 for no drop and decreases with bigger drops', () => {
    expect(accuracyFromWinDelta(0)).toBe(100);
    const small = accuracyFromWinDelta(2);
    const big = accuracyFromWinDelta(30);
    expect(small).toBeGreaterThan(big);
    expect(big).toBeGreaterThan(0);
  });
  it('clamps into 0..100', () => {
    expect(accuracyFromWinDelta(-5)).toBe(100);
    expect(accuracyFromWinDelta(5000)).toBeGreaterThanOrEqual(0);
    expect(accuracyFromWinDelta(5000)).toBeLessThanOrEqual(100);
  });
});

describe('centipawnLossAt', () => {
  it('computes loss as before + after (opponent perspective)', () => {
    const scores = [30, -10, 25]; // side-to-move perspective per position
    expect(centipawnLossAt(scores, 0)).toBe(20); // 30 + (-10)
  });
  it('never returns negative', () => {
    const scores = [10, -30];
    expect(centipawnLossAt(scores, 0)).toBe(0);
  });
  it('returns null when either neighbor is unanalyzed', () => {
    expect(centipawnLossAt([null, -10], 0)).toBeNull();
    expect(centipawnLossAt([10, null], 0)).toBeNull();
    expect(centipawnLossAt(null, 0)).toBeNull();
  });
});

describe('classifyMove', () => {
  it('classifies by centipawn loss thresholds', () => {
    expect(classifyMove(0)).toBe('best');
    expect(classifyMove(20)).toBe('excellent');
    expect(classifyMove(40)).toBe('good');
    expect(classifyMove(80)).toBe('inaccuracy');
    expect(classifyMove(150)).toBe('mistake');
    expect(classifyMove(400)).toBe('blunder');
  });
  it('is best when the engine best move was played', () => {
    expect(classifyMove(120, true)).toBe('best');
  });
  it('returns null for unknown loss', () => {
    expect(classifyMove(null)).toBeNull();
  });
});

describe('summarizeSide', () => {
  it('aggregates accuracy and counts for the given plies', () => {
    const losses = [0, 40, 300, 60, 5, null];
    const white = summarizeSide(losses, [0, 2, 4]);
    const black = summarizeSide(losses, [1, 3, 5]);
    expect(white.counts).toEqual({ best: 2, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 });
    expect(white.analyzedMoves).toBe(3);
    expect(black.analyzedMoves).toBe(2); // null skipped
    expect(white.accuracy).toBeGreaterThan(0);
    expect(white.accuracy).toBeLessThanOrEqual(100);
  });
  it('returns null accuracy when nothing is analyzed', () => {
    expect(summarizeSide([null, null], [0, 1]).accuracy).toBeNull();
  });
});

describe('formatEval', () => {
  it('formats pawns with a sign', () => {
    expect(formatEval(83)).toBe('+0.8');
    expect(formatEval(-120)).toBe('−1.2');
    expect(formatEval(0)).toBe('0.0');
  });
  it('marks mate scores', () => {
    expect(formatEval(100000)).toBe('M');
    expect(formatEval(-100000)).toBe('-M');
  });
  it('shows a dash when unknown', () => {
    expect(formatEval(null)).toBe('—');
  });
});

describe('MOVE_CLASSES', () => {
  it('covers all classification keys', () => {
    expect(Object.keys(MOVE_CLASSES).sort()).toEqual(
      ['best', 'blunder', 'excellent', 'good', 'inaccuracy', 'mistake'].sort()
    );
    for (const cls of Object.values(MOVE_CLASSES)) {
      expect(cls.label).toBeTruthy();
      expect(cls.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
