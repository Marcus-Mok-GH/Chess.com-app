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
    ).toEqual(['unlimited', 'rapid', 'rapid_10_3', 'classical']);
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

    const option = Array.from(timeControlSelect().options).find(
      (entry) => entry.value === 'rapid_10_3',
    );
    expect(option.textContent).toContain('Rapid 10+3');
    expect(option.textContent).toContain('10 min + 3s per move');
  });
});
