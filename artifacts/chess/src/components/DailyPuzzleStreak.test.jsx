import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// ── Module-level mocks (factories must not reference outer variables) ──────────

vi.mock('../services/api', () => ({
  default: {
    getUserSettings: vi.fn().mockResolvedValue({ settings: {} }),
    updateUserSettings: vi.fn().mockResolvedValue({ success: true }),
  },
  api: {
    getUserSettings: vi.fn().mockResolvedValue({ settings: {} }),
    updateUserSettings: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: vi.fn().mockReturnValue({ user: null, token: null, isLoggedIn: false }),
}));

vi.mock('./ChessBoard', () => ({
  default: () => <div data-testid="chessboard">Board</div>,
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
      api.getUserSettings.mockReturnValue(new Promise(() => {}));
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      const { container } = render(<DailyPuzzleStreak />);

      expect(container.querySelector('.daily-puzzle-streak-spinner')).not.toBeNull();
    });

    it('does not show spinner for guest users', async () => {
      mockUserGuest();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      const { container } = render(<DailyPuzzleStreak />);

      expect(container.querySelector('.daily-puzzle-streak-spinner')).toBeNull();
    });

    it('calls getUserSettings when logged in', async () => {
      mockUserLoggedIn();
      api.getUserSettings.mockResolvedValue({ settings: { puzzleStreak: { count: 5, bestStreak: 8, lastDate: getTodayDateString(), completedToday: true } } });

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(<DailyPuzzleStreak />);
      });

      expect(api.getUserSettings).toHaveBeenCalledWith('testplayer', 'tok-abc');
    });

    it('does not call getUserSettings for guest', async () => {
      mockUserGuest();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(<DailyPuzzleStreak />);
      });

      expect(api.getUserSettings).not.toHaveBeenCalled();
    });
  });

  describe('merge logic', () => {
    it('uses remote data when remote streak count is higher', async () => {
      const today = getTodayDateString();
      saveStreakData({ lastDate: today, count: 2, bestStreak: 3, completedToday: false }, 'user-123');
      api.getUserSettings.mockResolvedValue({
        settings: { puzzleStreak: { count: 10, bestStreak: 12, lastDate: today, completedToday: true } },
      });
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(<DailyPuzzleStreak />);
      });

      await waitFor(() => {
        const stored = loadStreakData('user-123');
        expect(stored.count).toBe(10);
        expect(stored.bestStreak).toBe(12);
      });
    });

    it('keeps local data when local streak count is higher', async () => {
      const today = getTodayDateString();
      saveStreakData({ lastDate: today, count: 8, bestStreak: 9, completedToday: true }, 'user-123');
      api.getUserSettings.mockResolvedValue({
        settings: { puzzleStreak: { count: 3, bestStreak: 4, lastDate: today, completedToday: false } },
      });
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(<DailyPuzzleStreak />);
      });

      await waitFor(() => {
        const stored = loadStreakData('user-123');
        expect(stored.count).toBe(8);
        expect(stored.bestStreak).toBe(9);
      });
    });

    it('takes max bestStreak from both local and remote', async () => {
      const today = getTodayDateString();
      saveStreakData({ lastDate: today, count: 5, bestStreak: 20, completedToday: false }, 'user-123');
      api.getUserSettings.mockResolvedValue({
        settings: { puzzleStreak: { count: 10, bestStreak: 15, lastDate: today, completedToday: true } },
      });
      mockUserLoggedIn();

      const { default: DailyPuzzleStreak } = await import('./DailyPuzzleStreak');
      await act(async () => {
        render(<DailyPuzzleStreak />);
      });

      await waitFor(() => {
        const stored = loadStreakData('user-123');
        expect(stored.count).toBe(10);
        expect(stored.bestStreak).toBe(20);
      });
    });
  });
});
