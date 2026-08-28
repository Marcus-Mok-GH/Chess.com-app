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

describe('UserBadge Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Sign In button with aria-label when not logged in', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: false,
      user: null,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const signInBtn = screen.getByRole('button', { name: /sign in to your account/i });
    expect(signInBtn).toBeTruthy();

    fireEvent.click(signInBtn);
    expect(screen.getByTestId('login-modal')).toBeTruthy();
  });

  it('renders user badge with accessibility attributes when logged in', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      user: { username: 'Grandmaster', elo: 1800, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const badgeBtn = screen.getByRole('button', { name: /user profile and menu/i });
    expect(badgeBtn).toBeTruthy();
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('false');
    expect(badgeBtn.getAttribute('aria-haspopup')).toBe('true');
  });

  it('toggles menu, updates aria-expanded, and handles Escape key to close menu', () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      user: { username: 'Grandmaster', elo: 1800, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const badgeBtn = screen.getByRole('button', { name: /user profile and menu/i });

    // Open dropdown
    fireEvent.click(badgeBtn);
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: /user menu/i });
    expect(menu).toBeTruthy();

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBe(2);

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
