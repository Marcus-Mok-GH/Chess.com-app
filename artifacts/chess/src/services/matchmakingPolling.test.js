import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('MatchmakingPollingService uses API_BASE_URL', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  it('joinMatchmaking sends to API_BASE_URL/matchmaking/join', async () => {
    const { default: svc } = await import('./matchmakingPolling.js');
    const result = await svc.joinMatchmaking('player1', 'Alice', 1200, true);
    expect(result).toBe(true);
    const [calledUrl] = fetchMock.mock.calls[0];
    // The default API_BASE_URL is '/api', so the full URL should be /api/matchmaking/join
    expect(calledUrl).toContain('/matchmaking/join');
  });

  it('leaveMatchmaking sends to API_BASE_URL/matchmaking/leave', async () => {
    const { default: svc } = await import('./matchmakingPolling.js');
    await svc.leaveMatchmaking('player1');
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain('/matchmaking/leave');
  });
});

describe('MatchmakingPollingService API_BASE_URL with custom base', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  it('requests include base path when VITE_API_URL is set', async () => {
    // Simulate custom base URL by importing with mocked apiBase
    vi.doMock('./apiBase.js', () => ({
      API_BASE_URL: 'https://myserver.com/api',
      isNetworkError: () => false,
    }));

    const { default: svc } = await import('./matchmakingPolling.js');
    await svc.joinMatchmaking('player1', 'Alice', 1200, true);
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toMatch(/^https:\/\/myserver\.com\/api\/matchmaking\/join/);
  });
});
