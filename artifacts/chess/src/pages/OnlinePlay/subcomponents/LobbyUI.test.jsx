import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LobbyUI from './LobbyUI';

const defaultProps = {
  isLoggedIn: true,
  user: { username: 'tester', elo: 1200 },
  playerElo: 1200,
  error: '',
  handleSelectMode: vi.fn(),
  navigate: vi.fn(),
  timeControl: 'unlimited',
  onSelectTimeControl: vi.fn(),
};

function timeControlSelect() {
  return screen.getByRole('combobox', { name: /time control/i });
}

describe('LobbyUI time control', () => {
  it('offers every control in a single dropdown', () => {
    render(<LobbyUI {...defaultProps} />);

    expect(
      Array.from(timeControlSelect().options).map((option) => option.value),
    ).toEqual([
      'unlimited',
      'bullet',
      'blitz',
      'blitz_3_2',
      'rapid',
      'rapid_10_3',
      'classical',
      'classical_30_5',
    ]);
  });

  it('reflects the currently selected control', () => {
    render(<LobbyUI {...defaultProps} timeControl="rapid" />);

    expect(timeControlSelect().value).toBe('rapid');
  });

  it('reports a new selection', () => {
    const onSelectTimeControl = vi.fn();
    render(
      <LobbyUI {...defaultProps} onSelectTimeControl={onSelectTimeControl} />,
    );

    fireEvent.change(timeControlSelect(), { target: { value: 'rapid_10_3' } });

    expect(onSelectTimeControl).toHaveBeenCalledWith('rapid_10_3');
  });

  it('describes each control for screen readers', () => {
    render(<LobbyUI {...defaultProps} />);

    const blitz = Array.from(timeControlSelect().options).find(
      (entry) => entry.value === 'blitz',
    );
    expect(blitz.textContent).toContain('Blitz');
    expect(blitz.textContent).toContain('3 minutes each');

    const bullet = Array.from(timeControlSelect().options).find(
      (entry) => entry.value === 'bullet',
    );
    expect(bullet.textContent).toContain('Bullet');
    expect(bullet.textContent).toContain('1 minute each');

    const blitzIncrement = Array.from(timeControlSelect().options).find(
      (entry) => entry.value === 'blitz_3_2',
    );
    expect(blitzIncrement.textContent).toContain('Blitz 3+2');
    expect(blitzIncrement.textContent).toContain('3 min + 2s per move');

    const rapid = Array.from(timeControlSelect().options).find(
      (entry) => entry.value === 'rapid_10_3',
    );
    expect(rapid.textContent).toContain('Rapid 10+3');
    expect(rapid.textContent).toContain('10 min + 3s per move');

    const classical = Array.from(timeControlSelect().options).find(
      (entry) => entry.value === 'classical_30_5',
    );
    expect(classical.textContent).toContain('Classical 30+5');
    expect(classical.textContent).toContain('30 min + 5s per move');
  });
});
