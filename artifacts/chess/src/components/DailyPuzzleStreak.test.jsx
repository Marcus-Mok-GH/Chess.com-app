import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// ── Module-level mocks (factories must not reference outer variables) ──────────

vi.mock('../services/api', () => ({
  default: {
    getUserSettings: vi.fn().mockResolvedValue({ settings: {} }),
    updateUserSettings: vi.fn().mockResolvedValue({ success: true }),
    getPuzzleStreak: vi.fn().mockResolvedValue({
      success: true,
      streak: { currentStreak: 0, bestStreak: 0, lastSolvedOn: null, solvedToday: false },
    }),
    recordPuzzleStreak: vi.fn().mockResolvedValue({
      success: true,
      streak: { currentStreak: 1, bestStreak: 1, lastSolvedOn: '2026-11-17', solvedToday: true },
    }),
  },
  api: {
    getUserSettings: vi.fn().mockResolvedValue({ settings: {} }),
    updateUserSettings: vi.fn().mockResolvedValue({ success: true }),
    getPuzzleStreak: vi.fn().mockResolvedValue({
      success: true,
      streak: { currentStreak: 0, bestStreak: 0, lastSolvedOn: null, solvedToday: false },
    }),
    recordPuzzleStreak: vi.fn().mockResolvedValue({
      success: true,
      streak: { currentStreak: 1, bestStreak: 1, lastSolvedOn: '2026-11-17', solvedToday: true },
    }),
  },
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: vi.fn().mockReturnValue({ user: null, token: null, isLoggedIn: false }),
}));

vi.mock('./ChessBoard', () => ({
  default: ({ onPieceDrop }) => (
    <div data-testid="chessboard">
      Board
      <button data-testid="solve-c3c4" onClick={() => onPieceDrop && onPieceDrop('e5', 'f7')}>
        solve
      </button>
    </div>
  ),
}));

vi.mock('../engine/puzzles/puzzleGenerator', () => ({
  generatePuzzle: vi.fn(() => ({
    id: 'test-tactic',
    fen: '3q3k/8/8/4N3/8/8/8/6K1 w - - 0 1',
    sideToMove: 'white',
    solution: 'Nf7+',
    theme: 'Forcing Capture',
    hint: 'Test hint',
    type: 'tactics',
  })),
}));

import { useUser } from '../contexts/UserContext';
import api from '../services/api';
import { loadStreakData, saveStreakData, getStreakState, getTodayDateString } from './DailyPuzzleStreak';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockUserLoggedIn(overrides = {}) {
  useUser.mockReturnValue({
    user: { id: 'user-123', username: 'testplayer', ...overrides.user },
    token: 'tok-abc',
    isLoggedIn: true,
    ...overrides,
  });
}

function mockUserGuest() {
  useUser.mockReturnValue({
    user: null,
    token: null,
    isLoggedIn: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DailyPuzzleStreak persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.getUserSettings.mockResolvedValue({ settings: {} });
    api.updateUserSettings.mockResolvedValue({ success: true });
    api.getPuzzleStreak.mockResolvedValue({
      success: true,
      streak: { currentStreak: 0, bestStreak: 0, lastSolvedOn: null, solvedToday: false },
    });
    api.recordPuzzleStreak.mockResolvedValue({
      success: true,
      streak: { currentStreak: 1, bestStreak: 1, lastSolvedOn: '2026-11-17', solvedToday: true },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('localStorage namespacing', () => {
    it('uses generic keys when no userId is provided (guest mode)', () => {
      const data = { lastDate: '2026-08-15', count: 3, bestStreak: 5, completedToday: true };
      saveStreakData(data, null);

      expect(localStorage.getItem('puzzleStreak_lastDate')).toBe('2026-08-15');
      expect(localStorage.getItem('puzzleStreak_count')).toBe('3');
      expect(localStorage.getItem('puzzleStreak_bestStreak')).toBe('5');
      expect(localStorage.getItem('puzzleStreak_completedToday')).toBe('true');
    });

    it('uses user-scoped keys when userId is provided', () => {
      const data = { lastDate: '2026-08-15', count: 7, bestStreak: 10, completedToday: false };
      saveStreakData(data, 'user-123');

      expect(localStorage.getItem('puzzleStreak_user-123_lastDate')).toBe('2026-08-15');
      expect(localStorage.getItem('puzzleStreak_user-123_count')).toBe('7');
      expect(localStorage.getItem('puzzleStreak_user-123_bestStreak')).toBe('10');
      expect(localStorage.getItem('puzzleStreak_user-123_completedToday')).toBe('false');
      // Generic keys should NOT be set
      expect(localStorage.getItem('puzzleStreak_lastDate')).toBeNull();
    });

    it('loadStreakData reads from user-scoped keys', () => {
      localStorage.setItem('puzzleStreak_user-456_lastDate', '2026-08-14');
      localStorage.setItem('puzzleStreak_user-456_count', '12');
      localStorage.setItem('puzzleStreak_user-456_bestStreak', '15');
      localStorage.setItem('puzzleStreak_user-456_completedToday', 'true');

      const result = loadStreakData('user-456');
      expect(result).toEqual({
        lastDate: '2026-08-14',
        count: 12,
        bestStreak: 15,
        completedToday: true,
      });
    });

    it('loadStreakData reads from generic keys for guest', () => {
      localStorage.setItem('puzzleStreak_lastDate', '2026-08-13');
      localStorage.setItem('puzzleStreak_count', '2');
      localStorage.setItem('puzzleStreak_bestStreak', '4');
      localStorage.setItem('puzzleStreak_completedToday', 'false');

      const result = loadStreakData(null);
      expect(result).toEqual({
        lastDate: '2026-08-13',
        count: 2,
        bestStreak: 4,
        completedToday: false,
      });
    });

    it('different users have independent streak data', () => {
      saveStreakData({ lastDate: '2026-08-15', count: 5, bestStreak: 5, completedToday: true }, 'user-A');
      saveStreakData({ lastDate: '2026-08-15', count: 2, bestStreak: 8, completedToday: false }, 'user-B');

      const dataA = loadStreakData('user-A');
      const dataB = loadStreakData('user-B');

      expect(dataA.count).toBe(5);
      expect(dataB.count).toBe(2);
      expect(dataA.bestStreak).toBe(5);
      expect(dataB.bestStreak).toBe(8);
    });
  });

  describe('getStreakState', () => {
    it('returns data unchanged if lastDate matches today', () => {
      const today = getTodayDateString();
      saveStreakData({ lastDate: today, count: 4, bestStreak: 6, completedToday: true }, 'user-X');

      const state = getStreakState('user-X');
      expect(state.count).toBe(4);
      expect(state.completedToday).toBe(true);
    });

    it('resets streak count if more than one day has passed', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const dateStr = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`;

      saveStreakData({ lastDate: dateStr, count: 5, bestStreak: 10, completedToday: true }, 'user-Y');

      const state = getStreakState('user-Y');
      expect(state.count).toBe(0);
      expect(state.bestStreak).toBe(10);
      expect(state.completedToday).toBe(false);
    });

    it('preserves streak if lastDate is yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      saveStreakData({ lastDate: dateStr, count: 3, bestStreak: 7, completedToday: true }, 'user-Z');

      const state = getStreakState('user-Z');
      expect(state.count).toBe(3);
      expect(state.completedToday).toBe(false);
    });
  });

  describe('Component rendering with user context', () => {
    it('shows loading spinner when sync is in progress for logged-in user', async () => {
      // Make API call hang forever
      api.getPuzzleStreak.mockReturnValue(new Promise(() => {}));
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      const { container } = render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );

      expect(container.querySelector('.daily-puzzle-streak-spinner')).not.toBeNull();
    });

    it('does not show spinner for guest users', async () => {
      mockUserGuest();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      const { container } = render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );

      expect(container.querySelector('.daily-puzzle-streak-spinner')).toBeNull();
    });

    it('reads the streak from the account endpoint when logged in', async () => {
      mockUserLoggedIn();
      api.getPuzzleStreak.mockResolvedValue({
        success: true,
        streak: { currentStreak: 5, bestStreak: 8, lastSolvedOn: getTodayDateString(), solvedToday: true },
      });

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );
      });

      expect(api.getPuzzleStreak).toHaveBeenCalled();
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText(/Great job/)).toBeTruthy();
    });

    it('does not call the account endpoint for a guest', async () => {
      mockUserGuest();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );
      });

      expect(api.getPuzzleStreak).not.toHaveBeenCalled();
    });
  });

  describe('account streak is the source of truth', () => {
    it('shows the account streak even when this device has a different one cached', async () => {
      const today = getTodayDateString();
      saveStreakData({ lastDate: today, count: 2, bestStreak: 3, completedToday: false }, 'user-123');
      api.getPuzzleStreak.mockResolvedValue({
        success: true,
        streak: { currentStreak: 10, bestStreak: 12, lastSolvedOn: today, solvedToday: true },
      });
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );
      });

      await waitFor(() => {
        expect(screen.getByText('10')).toBeTruthy();
        expect(screen.getByText(/Best:/)).toBeTruthy();
      });
      // The device cache is not promoted or merged into the account view.
      expect(loadStreakData('user-123').count).toBe(2);
    });

    it('does not let a high device-local streak override the account', async () => {
      const today = getTodayDateString();
      saveStreakData({ lastDate: today, count: 40, bestStreak: 40, completedToday: true }, null);
      api.getPuzzleStreak.mockResolvedValue({
        success: true,
        streak: { currentStreak: 3, bestStreak: 4, lastSolvedOn: today, solvedToday: false },
      });
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );
      });

      await waitFor(() => {
        expect(screen.getByText('3')).toBeTruthy();
      });
    });

    it('writes a solve to the server and takes the returned numbers', async () => {
      mockUserLoggedIn();
      api.getPuzzleStreak.mockResolvedValue({
        success: true,
        streak: { currentStreak: 6, bestStreak: 6, lastSolvedOn: '2026-11-16', solvedToday: false },
      });
      api.recordPuzzleStreak.mockResolvedValue({
        success: true,
        streak: { currentStreak: 7, bestStreak: 9, lastSolvedOn: getTodayDateString(), solvedToday: true },
      });

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );
      });

      fireEvent.click(screen.getByRole('button', { name: /Solve Today's Puzzle/i }));
      fireEvent.click(await screen.findByTestId('solve-c3c4'));

      await waitFor(() => {
        expect(api.recordPuzzleStreak).toHaveBeenCalledTimes(1);
        expect(screen.getByText('7')).toBeTruthy();
      });
    });

    it('keeps guests on device storage and never calls the server', async () => {
      mockUserGuest();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(
        <MemoryRouter>
          <DailyPuzzleStreak />
        </MemoryRouter>
      );
      });

      fireEvent.click(screen.getByRole('button', { name: /Solve Today's Puzzle/i }));
      fireEvent.click(await screen.findByTestId('solve-c3c4'));

      await waitFor(() => {
        expect(loadStreakData(null).completedToday).toBe(true);
      });
      expect(api.recordPuzzleStreak).not.toHaveBeenCalled();
    });
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('Solve Today\u2019s Puzzle button navigation', () => {
  it('navigates to /puzzles instead of expanding the board when linkToPuzzles is set', async () => {
    mockUserGuest();
    const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');

    const { container, getByTestId } = render(
      <MemoryRouter initialEntries={['/home']}>
        <DailyPuzzleStreak linkToPuzzles />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    const btn = container.querySelector('.daily-puzzle-solve-btn');
    expect(btn).not.toBeNull();

    act(() => {
      btn.click();
    });

    // Inline board must NOT open on the home page anymore
    expect(container.querySelector('.daily-puzzle-board-area')).toBeNull();
    // Navigation landed on the puzzle page
    expect(getByTestId('location-probe').textContent).toBe('/puzzles');
  });

  it('still expands the inline board when linkToPuzzles is not set', async () => {
    mockUserGuest();
    const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');

    const { container } = render(
      <MemoryRouter initialEntries={['/puzzles']}>
        <DailyPuzzleStreak />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    const btn = container.querySelector('.daily-puzzle-solve-btn');
    act(() => {
      btn.click();
    });

    expect(container.querySelector('.daily-puzzle-board-area')).not.toBeNull();
  });
});
