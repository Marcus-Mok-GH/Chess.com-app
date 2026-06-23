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
