import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UserBadge from './UserBadge';
import { useUser } from '../contexts/UserContext';

vi.mock('../contexts/UserContext', () => ({
  useUser: vi.fn(),
}));

describe('UserBadge', () => {
  it('renders Sign In button with aria-label when user is logged out', () => {
    useUser.mockReturnValue({
      isLoggedIn: false,
      user: null,
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);

    const signInBtn = screen.getByRole('button', { name: /sign in to your account/i });
    expect(signInBtn).toBeTruthy();
  });

  it('renders user badge with aria attributes when logged in', () => {
    useUser.mockReturnValue({
      isLoggedIn: true,
      user: { username: 'GrandmasterFlex', elo: 1500, gamesPlayed: 10, wins: 6, losses: 3, draws: 1 },
      logout: vi.fn(),
      isOnline: true,
    });

    render(<UserBadge />);

    const badgeBtn = screen.getByRole('button', {
      name: /user menu for grandmasterflex, rating 1500, status online/i,
    });
    expect(badgeBtn).toBeTruthy();
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('false');
    expect(badgeBtn.getAttribute('aria-haspopup')).toBe('true');

    // Click to open dropdown
    fireEvent.click(badgeBtn);
    expect(badgeBtn.getAttribute('aria-expanded')).toBe('true');
  });
});
