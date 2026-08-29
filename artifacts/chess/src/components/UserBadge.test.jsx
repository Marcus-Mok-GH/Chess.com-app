import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserBadge from './UserBadge';

vi.mock('./UserBadge.css', () => ({}));

const mockUseUser = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

describe('UserBadge Accessibility & UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sign in button with aria-label when logged out', () => {
    mockUseUser.mockReturnValue({
      user: null,
      isLoggedIn: false,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const signInBtn = screen.getByRole('button', { name: /sign in/i });
    expect(signInBtn).toBeTruthy();
    expect(signInBtn.getAttribute('aria-label')).toBe('Sign in');
  });

  it('renders user badge button with ARIA attributes when logged in', () => {
    mockUseUser.mockReturnValue({
      user: { username: 'Grandmaster', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      isLoggedIn: true,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const userBadgeBtn = screen.getByRole('button', { name: /user profile menu/i });
    expect(userBadgeBtn).toBeTruthy();
    expect(userBadgeBtn.getAttribute('aria-haspopup')).toBe('true');
    expect(userBadgeBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles dropdown menu on click and sets aria-expanded', () => {
    mockUseUser.mockReturnValue({
      user: { username: 'Grandmaster', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      isLoggedIn: true,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const userBadgeBtn = screen.getByRole('button', { name: /user profile menu/i });
    fireEvent.click(userBadgeBtn);

    expect(userBadgeBtn.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: /user profile options/i });
    expect(menu).toBeTruthy();

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBeGreaterThanOrEqual(2);
  });

  it('closes dropdown menu when pressing Escape key', () => {
    mockUseUser.mockReturnValue({
      user: { username: 'Grandmaster', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      isLoggedIn: true,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);
    const userBadgeBtn = screen.getByRole('button', { name: /user profile menu/i });
    fireEvent.click(userBadgeBtn);

    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(userBadgeBtn.getAttribute('aria-expanded')).toBe('false');
  });
});
