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

describe('LobbyUI time control', () => {
  it('offers unlimited, rapid, and rapid 10+3', () => {
    render(<LobbyUI {...defaultProps} />);
    expect(screen.getByTitle('No clock — take as long as you like')).toBeDefined();
    expect(screen.getByTitle('10 minutes each')).toBeDefined();
    expect(screen.getByTitle('10 min + 3s per move')).toBeDefined();
  });

  it('marks the current selection as pressed', () => {
    render(<LobbyUI {...defaultProps} timeControl="rapid" />);
    const rapid = screen.getByTitle('10 minutes each');
    expect(rapid.getAttribute('aria-pressed')).toBe('true');
    expect(rapid.className).toContain('selected');
    expect(
      screen.getByTitle('10 min + 3s per move').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('reports a new selection', () => {
    const onSelectTimeControl = vi.fn();
    render(
      <LobbyUI {...defaultProps} onSelectTimeControl={onSelectTimeControl} />,
    );
    fireEvent.click(screen.getByTitle('10 min + 3s per move'));
    expect(onSelectTimeControl).toHaveBeenCalledWith('rapid_10_3');
  });

  it('describes the controls for screen readers and tooltips', () => {
    render(<LobbyUI {...defaultProps} />);
    expect(screen.getByRole('group', { name: /time control/i })).toBeDefined();
    expect(screen.getByTitle('10 minutes each').textContent).toContain('Rapid');
    expect(screen.getByTitle('10 min + 3s per move').textContent).toContain(
      'Rapid 10+3',
    );
  });
});
