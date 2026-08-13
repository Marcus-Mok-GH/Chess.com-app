import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('ApiService public stats', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it('requests /stats/public via API base URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ livePlayers: 4 }),
    });

    const { api } = await import('./api');
    const response = await api.getPublicStats();

    expect(response).toEqual({ livePlayers: 4 });
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain('/stats/public');
  });
});

describe('ApiService.request header precedence', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it('preserves Content-Type and caller-supplied Authorization', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { api } = await import('./api');
    // Use the real update-username path, which always sends an Authorization header.
    await api.updateUsername('testuser', 'stub-token');

    // First call argument[1] is the fetch options.
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer stub-token',
    });
  });
});

describe('ApiService learning and opening explorer contracts', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  it('requests the Lessons catalog and authenticated progress endpoints', async () => {
    const { api } = await import('./api');

    await api.getLessons();
    await api.getLessonProgress();
    await api.saveLessonProgress('forks', { completed: true });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining('/lessons'),
      expect.stringContaining('/lessons/progress'),
      expect.stringContaining('/lessons/forks/progress'),
    ]));
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ completed: true }),
    });
  });

  it('requests opening roots, children, and search results with encoded parameters', async () => {
    const { api } = await import('./api');
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    await api.getOpeningRoots();
    await api.getOpeningChildren(fen);
    await api.searchOpenings('queen’s gambit');

    const calledUrls = fetchMock.mock.calls.map(([url]) => url);
    expect(calledUrls).toEqual(expect.arrayContaining([
      expect.stringContaining('/openings'),
      expect.stringContaining(`/openings/children?fen=${encodeURIComponent(fen)}`),
      expect.stringContaining(`/openings/search?q=${encodeURIComponent('queen’s gambit')}`),
    ]));
  });
});
