import { describe, it, expect, vi, afterEach } from 'vitest';
import { Chess } from 'chess.js';
import { confirmMove, describeMove } from './confirmMove';

describe('describeMove', () => {
  it('returns SAN for a legal move', () => {
    const game = new Chess();
    expect(describeMove(game, 'e2', 'e4')).toBe('e4');
    expect(describeMove(game, 'g1', 'f3')).toBe('Nf3');
  });

  it('falls back to a compact label for an illegal move', () => {
    const game = new Chess();
    expect(describeMove(game, 'e2', 'e5')).toBe('e2-e5');
  });

  it('returns null when coordinates are missing', () => {
    expect(describeMove(new Chess(), null, 'e4')).toBeNull();
  });
});

describe('confirmMove', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips the prompt when the setting is off', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(
      confirmMove({ settings: { confirmMoves: false }, game: new Chess(), from: 'e2', to: 'e4' }),
    ).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('skips the prompt when settings are missing', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(confirmMove({ game: new Chess(), from: 'e2', to: 'e4' })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('prompts with the move notation and proceeds when accepted', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(
      confirmMove({ settings: { confirmMoves: true }, game: new Chess(), from: 'e2', to: 'e4' }),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Confirm move: e4?');
  });

  it('blocks the move when declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(
      confirmMove({ settings: { confirmMoves: true }, game: new Chess(), from: 'e2', to: 'e4' }),
    ).toBe(false);
  });
});
