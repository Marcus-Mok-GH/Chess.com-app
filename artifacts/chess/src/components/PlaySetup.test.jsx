import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import PlaySetup from './PlaySetup';
import { BOTS } from '../engine/bots/bots';

const NELSON = BOTS.find((b) => b.id === 'nelson');
const REX = BOTS.find((b) => b.id === 'rex');

const defaultProps = {
  selectedBot: NELSON,
  onSelectBot: vi.fn(),
  customElo: 1000,
  onCustomEloChange: vi.fn(),
  playerColor: 'w',
  onSelectColor: vi.fn(),
  onStart: vi.fn(),
  isLoggedIn: true,
  hasSubscription: false,
};

function renderSetup(props = {}) {
  return render(
    <MemoryRouter>
      <PlaySetup {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe('PlaySetup', () => {
  it('renders White, Black, and Random color options', () => {
    renderSetup();
    expect(screen.getByRole('button', { name: /white/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /black/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /random/i })).toBeDefined();
  });

  it('marks Random selected and pressed when playerColor is random', () => {
    renderSetup({ playerColor: 'random' });
    const randomBtn = screen.getByRole('button', { name: /random/i });
    expect(randomBtn.className).toContain('selected');
    expect(randomBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('selects Random via onSelectColor and enables Start', () => {
    const onSelectColor = vi.fn();
    renderSetup({ onSelectColor, playerColor: 'random' });
    fireEvent.click(screen.getByRole('button', { name: /random/i }));
    expect(onSelectColor).toHaveBeenCalledWith('random');
    expect(screen.getByRole('button', { name: /start game/i }).disabled).toBe(false);
  });

  it('keeps Start disabled with no concrete color selected', () => {
    renderSetup({ playerColor: null });
    expect(screen.getByRole('button', { name: /start game/i }).disabled).toBe(true);
  });

  it('keeps Start disabled when a premium bot is selected without a subscription', () => {
    renderSetup({ selectedBot: REX, hasSubscription: false });
    expect(screen.getByRole('button', { name: /start game/i }).disabled).toBe(true);
  });

  it('enables Start for a premium bot when the user is subscribed', () => {
    renderSetup({ selectedBot: REX, hasSubscription: true });
    expect(screen.getByRole('button', { name: /start game/i }).disabled).toBe(false);
  });

  it('renders a Back button that calls onBack when provided', () => {
    const onBack = vi.fn();
    renderSetup({ onBack });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the Back button when no onBack handler is provided', () => {
    renderSetup();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
