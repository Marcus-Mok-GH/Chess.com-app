import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import GameResultDialog, { botGameOutcome, onlineGameOutcome } from './GameResultDialog';

describe('game result popup', () => {
  it('resolves bot resignation and either side of checkmate', () => {
    const game = new Chess();
    expect(botGameOutcome(game, 'w', false)).toBeNull();
    expect(botGameOutcome(game, 'w', true)).toBe('lost');
    game.load('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
    expect(botGameOutcome(game, 'w', false)).toBe('won');
    expect(botGameOutcome(game, 'b', false)).toBe('lost');
  });

  it('resolves online wins and losses only for resignation and checkmate', () => {
    expect(onlineGameOutcome('playing', 'white', 'white', 'checkmate')).toBeNull();
    expect(onlineGameOutcome('ended', 'white', 'white', 'checkmate')).toBe('won');
    expect(onlineGameOutcome('ended', 'white', 'black', 'checkmate')).toBe('lost');
    expect(onlineGameOutcome('ended', 'black', 'white', 'resignation')).toBe('lost');
    expect(onlineGameOutcome('ended', 'black', 'black', 'resignation')).toBe('won');
    expect(onlineGameOutcome('ended', 'draw', 'white', 'draw')).toBeNull();
    expect(onlineGameOutcome('ended', 'black', 'white', 'timeout')).toBeNull();
    expect(onlineGameOutcome('ended', 'black', 'white', null)).toBeNull();
  });

  it('opens on a live result, dismisses, and stays dismissed for the same game', () => {
    const { rerender } = render(<GameResultDialog gameId="abc" outcome={null} />);
    rerender(<GameResultDialog gameId="abc" outcome="won" />);
    expect(screen.getByRole('dialog').textContent).toContain('You won!');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<GameResultDialog gameId="abc" outcome="won" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<GameResultDialog gameId="def" outcome={null} />);
    rerender(<GameResultDialog gameId="def" outcome="lost" />);
    expect(screen.getByRole('dialog').textContent).toContain('You lost');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not interrupt an already finished game on first render', () => {
    render(<GameResultDialog gameId="old" outcome="lost" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
