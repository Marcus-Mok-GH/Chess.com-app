import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

import { query } from '../db.js';
import { getStreak, recordSolve } from './puzzleStreakService.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getStreak', () => {
  it('returns a zero streak for an account that has never solved', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getStreak('user-42')).resolves.toEqual({
      currentStreak: 0,
      bestStreak: 0,
      lastSolvedOn: null,
      solvedToday: false,
    });
  });

  it('reports today as solved when the row says so', async () => {
    query.mockResolvedValueOnce({
      rows: [{ current_streak: 6, best_streak: 9, last_solved_on: '2026-11-17', solved_today: true }],
    });
    await expect(getStreak('user-42')).resolves.toEqual({
      currentStreak: 6,
      bestStreak: 9,
      lastSolvedOn: '2026-11-17',
      solvedToday: true,
    });
  });

  it('reports the run as live while it is only one day old', async () => {
    query.mockResolvedValueOnce({
      rows: [{ current_streak: 3, best_streak: 3, last_solved_on: '2026-11-16', solved_today: false }],
    });
    const streak = await getStreak('user-42');
    expect(streak.currentStreak).toBe(3);
    expect(streak.solvedToday).toBe(false);
  });

  it('drops a stale run to zero in SQL instead of showing an old number', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await getStreak('user-42');
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/CASE WHEN last_solved_on >= CURRENT_DATE - 1 THEN current_streak ELSE 0 END/);
    expect(sql).toMatch(/last_solved_on = CURRENT_DATE/);
  });

  it('keys the lookup by user id, never by device', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await getStreak('user-42');
    expect(query.mock.calls[0][1]).toEqual(['user-42']);
  });
});

describe('recordSolve', () => {
  it('upserts in one statement so concurrent solves cannot double count', async () => {
    query.mockResolvedValueOnce({
      rows: [{ current_streak: 4, best_streak: 4, last_solved_on: '2026-11-17', solved_today: true }],
    });
    const streak = await recordSolve('user-42');

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/INSERT INTO puzzle_streak/);
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
    // Same day: count unchanged. Yesterday: one more. A gap: back to 1.
    expect(sql).toMatch(/WHEN puzzle_streak\.last_solved_on = CURRENT_DATE THEN puzzle_streak\.current_streak/);
    expect(sql).toMatch(/WHEN puzzle_streak\.last_solved_on = CURRENT_DATE - 1 THEN puzzle_streak\.current_streak \+ 1/);
    expect(sql).toMatch(/ELSE 1/);
    // The best run never falls back, even when today restarts a streak.
    expect(sql).toMatch(/best_streak = GREATEST\(puzzle_streak\.best_streak,/);
    expect(streak).toEqual({
      currentStreak: 4,
      bestStreak: 4,
      lastSolvedOn: '2026-11-17',
      solvedToday: true,
    });
  });

  it('seeds a first solve at one', async () => {
    query.mockResolvedValueOnce({
      rows: [{ current_streak: 1, best_streak: 1, last_solved_on: '2026-11-17', solved_today: true }],
    });
    const streak = await recordSolve('new-user');
    expect(streak.currentStreak).toBe(1);
    expect(streak.bestStreak).toBe(1);
    expect(streak.solvedToday).toBe(true);
  });
});
