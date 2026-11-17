import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../PlayerBar', () => ({
  default: (props) => (
    <div
      data-testid="player-bar"
      data-clock={props.clockMs ?? ''}
      data-active={String(Boolean(props.clockActive))}
    >
      {props.name}
    </div>
  ),
}));

import TimedPlayerBar from './TimedPlayerBar';

function serverClock(overrides = {}) {
  return {
    timeControl: 'blitz',
    status: 'playing',
    whiteMs: 300000,
    blackMs: 240000,
    side: 'white',
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe('TimedPlayerBar', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  // The side on the move counts down from the moment the payload arrived, so a
  // few milliseconds have always elapsed by the time the bar renders.
  function expectClockNear(text, expected) {
    const shown = Number(text);
    expect(Number.isFinite(shown)).toBe(true);
    expect(shown).toBeLessThanOrEqual(expected);
    expect(shown).toBeGreaterThan(expected - 500);
  }

  it('shows the clock for the colour it represents', () => {
    render(<TimedPlayerBar player={{ name: 'patty', color: 'w' }} serverClock={serverClock()} gameStatus="playing" />);
    expectClockNear(screen.getByTestId('player-bar').getAttribute('data-clock'), 300000);
  });

  it('shows the other side of the clock on the black bar', () => {
    render(<TimedPlayerBar player={{ name: 'rex', color: 'b' }} serverClock={serverClock()} gameStatus="playing" />);
    // Black is not on the move, so its clock is exactly the server value.
    expect(Number(screen.getByTestId('player-bar').getAttribute('data-clock'))).toBe(240000);
  });

  it('marks only the side on the move as active', () => {
    const { rerender } = render(
      <TimedPlayerBar player={{ name: 'patty', color: 'w' }} serverClock={serverClock()} gameStatus="playing" />,
    );
    expect(screen.getByTestId('player-bar').getAttribute('data-active')).toBe('true');

    rerender(<TimedPlayerBar player={{ name: 'rex', color: 'b' }} serverClock={serverClock()} gameStatus="playing" />);
    expect(screen.getByTestId('player-bar').getAttribute('data-active')).toBe('false');
  });

  it('renders no clock at all in an untimed game', () => {
    render(
      <TimedPlayerBar
        player={{ name: 'patty', color: 'w' }}
        serverClock={serverClock({ timeControl: 'unlimited' })}
        gameStatus="playing"
      />,
    );
    expect(screen.getByTestId('player-bar').getAttribute('data-clock')).toBe('');
  });

  it('keeps the clock still while the game is finished', () => {
    render(
      <TimedPlayerBar
        player={{ name: 'patty', color: 'w' }}
        serverClock={serverClock({ status: 'finished' })}
        gameStatus="finished"
      />,
    );
    expect(screen.getByTestId('player-bar').getAttribute('data-active')).toBe('false');
  });
});
