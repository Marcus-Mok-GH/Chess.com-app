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
