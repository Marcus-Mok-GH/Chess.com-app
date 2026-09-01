import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserBadge from './UserBadge';

vi.mock('./UserBadge.css', () => ({}));
vi.mock('./LoginModal', () => ({
  default: () => <div data-testid="login-modal">Login Modal</div>,
}));

const mockUseUser = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

describe('UserBadge component accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Sign In button when user is logged out', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: false,
      user: null,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('renders user badge with ARIA attributes when logged in', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      user: { username: 'ChessMaster', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const badgeBtn = screen.getByRole('button', { name: /user menu for chessmaster/i });
    expect(badgeBtn).toBeTruthy();
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('false');
    expect(badgeBtn.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('opens menu with role="menu" and menuitems when clicked', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      user: { username: 'ChessMaster', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const badgeBtn = screen.getByRole('button', { name: /user menu for chessmaster/i });
    fireEvent.click(badgeBtn);

    expect(badgeBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBeGreaterThanOrEqual(2);
  });

  it('closes menu when Escape key is pressed', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      user: { username: 'ChessMaster', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const badgeBtn = screen.getByRole('button', { name: /user menu for chessmaster/i });
    fireEvent.click(badgeBtn);

    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('false');
  });
});
