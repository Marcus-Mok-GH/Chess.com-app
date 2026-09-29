import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlaySetup from './PlaySetup';
import { BOTS } from '../engine/bots/bots';

const NELSON = BOTS.find((b) => b.id === 'nelson');

const defaultProps = {
  selectedBot: NELSON,
  onSelectBot: vi.fn(),
  customElo: 1000,
  onCustomEloChange: vi.fn(),
  playerColor: 'w',
  onSelectColor: vi.fn(),
  onStart: vi.fn(),
  isLoggedIn: true,
};

describe('PlaySetup', () => {
  it('renders White, Black, and Random color options', () => {
    render(<PlaySetup {...defaultProps} />);
    expect(screen.getByRole('button', { name: /white/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /black/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /random/i })).toBeDefined();
  });

  it('marks Random selected and pressed when playerColor is random', () => {
    render(<PlaySetup {...defaultProps} playerColor="random" />);
    const randomBtn = screen.getByRole('button', { name: /random/i });
    expect(randomBtn.className).toContain('selected');
    expect(randomBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('selects Random via onSelectColor and enables Start', () => {
    const onSelectColor = vi.fn();
    render(<PlaySetup {...defaultProps} onSelectColor={onSelectColor} playerColor="random" />);
    fireEvent.click(screen.getByRole('button', { name: /random/i }));
    expect(onSelectColor).toHaveBeenCalledWith('random');
    expect(screen.getByRole('button', { name: /start game/i }).disabled).toBe(false);
  });

  it('keeps Start disabled with no concrete color selected', () => {
    render(<PlaySetup {...defaultProps} playerColor={null} />);
    expect(screen.getByRole('button', { name: /start game/i }).disabled).toBe(true);
  });
});
