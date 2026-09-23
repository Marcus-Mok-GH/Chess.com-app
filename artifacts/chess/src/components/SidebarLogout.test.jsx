import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../contexts/UserContext', () => ({
  UserProvider: ({ children }) => <div>{children}</div>,
  useUser: () => ({
    isOnline: true,
    isLoggedIn: true,
    user: { username: 'testuser', elo: 1200 },
    logout: vi.fn(),
  }),
}));

vi.mock('../contexts/SettingsContext', () => ({
  SettingsProvider: ({ children }) => <div>{children}</div>,
  useSettings: () => ({}),
}));

vi.mock('../hooks/usePuter', () => ({
  usePuter: () => ({ isReady: false }),
}));

// Mock react-router-dom's BrowserRouter to simple fragment so MemoryRouter doesn't conflict
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BrowserRouter: ({ children }) => <div>{children}</div>,
  };
});

describe('Sidebar Logout Button', () => {
  it('renders logout button with aria-label="Log out"', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>
    );

    const logoutButton = screen.getByRole('button', { name: /log out/i });
    expect(logoutButton).toBeTruthy();
    expect(logoutButton.getAttribute('aria-label')).toBe('Log out');
  });
});
