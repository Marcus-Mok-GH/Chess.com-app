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
  it('offers both unlimited and rapid', () => {
    render(<LobbyUI {...defaultProps} />);
    expect(screen.getByRole('button', { name: /unlimited/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /rapid/i })).toBeDefined();
  });

  it('marks the current selection as pressed', () => {
    render(<LobbyUI {...defaultProps} timeControl="rapid" />);
    const rapid = screen.getByRole('button', { name: /rapid/i });
    expect(rapid.getAttribute('aria-pressed')).toBe('true');
    expect(rapid.className).toContain('selected');
    expect(
      screen.getByRole('button', { name: /unlimited/i }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('reports a new selection', () => {
    const onSelectTimeControl = vi.fn();
    render(
      <LobbyUI {...defaultProps} onSelectTimeControl={onSelectTimeControl} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rapid/i }));
    expect(onSelectTimeControl).toHaveBeenCalledWith('rapid');
  });

  it('describes the controls for screen readers and tooltips', () => {
    render(<LobbyUI {...defaultProps} />);
    expect(screen.getByRole('group', { name: /time control/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /rapid/i }).getAttribute('title'),
    ).toBe('10 minutes each');
  });
});
