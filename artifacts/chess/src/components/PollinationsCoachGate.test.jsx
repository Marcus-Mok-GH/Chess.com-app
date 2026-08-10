import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollinationsCoachGate } from '../App';

const mockUseUser = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  UserProvider: ({ children }) => children,
  useUser: () => mockUseUser(),
}));

vi.mock('../services/api', () => ({
  default: {
    getUserSettings: vi.fn().mockResolvedValue({ settings: {} }),
    updateUserSettings: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../hooks/usePuter', () => ({
  usePuter: () => ({ isReady: true, error: null, chat: vi.fn(), isLoading: false }),
}));

function renderGate() {
  return render(
    <MemoryRouter>
      <PollinationsCoachGate />
    </MemoryRouter>
  );
}

describe('PollinationsCoachGate', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseUser.mockReset();
  });

  it('does not show the coach prompt for anonymous users', async () => {
    mockUseUser.mockReturnValue({ user: null, token: null, isLoggedIn: false, isLoading: false });
    renderGate();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows the coach prompt for a logged-in user who has not seen it', async () => {
    mockUseUser.mockReturnValue({
      user: { username: 'magnus' },
      token: 'test-token',
      isLoggedIn: true,
      isLoading: false,
    });
    renderGate();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByText(/Connect AI Coach/)).toBeDefined();
  });

  it('does not show the prompt when it was already seen locally', async () => {
    localStorage.setItem('pollinationsCoachPromptSeen:magnus', 'true');
    mockUseUser.mockReturnValue({
      user: { username: 'magnus' },
      token: 'test-token',
      isLoggedIn: true,
      isLoading: false,
    });
    renderGate();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
