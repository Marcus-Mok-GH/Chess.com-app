import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPollinationsTextModelsCache,
  getPollinationsTextModels,
  normalizePollinationsTextModels,
} from './pollinationsModels.js';

const compatible = (overrides = {}) => ({
  id: 'provider/model-a',
  title: 'Model A',
  category: 'text',
  supported_endpoints: ['/v1/chat/completions'],
  paid_only: false,
  ...overrides,
});

function jsonResponse(data, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => data };
}

afterEach(() => {
  clearPollinationsTextModelsCache();
  vi.restoreAllMocks();
});

describe('normalizePollinationsTextModels', () => {
  it('keeps only chat-compatible text models and marks paid models', () => {
    const models = normalizePollinationsTextModels({
      data: [
        compatible({ id: 'paid/model', title: 'Paid Model', paid_only: true }),
        compatible({ id: 'image/model', category: 'image' }),
        compatible({ id: 'no-chat/model', supported_endpoints: ['/text'] }),
        compatible({ id: 'free/model', title: 'Free Model' }),
      ],
    });

    expect(models).toEqual([
      expect.objectContaining({ id: 'free/model', title: 'Free Model', paidOnly: false }),
      expect.objectContaining({ id: 'paid/model', title: 'Paid Model', paidOnly: true }),
    ]);
  });

  it('returns an empty list for malformed provider data', () => {
    expect(normalizePollinationsTextModels({ data: null })).toEqual([]);
  });
});

describe('getPollinationsTextModels', () => {
  it('caches the provider response for five minutes', async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [compatible()] }));
    const options = { fetchImpl, now: () => now };

    const first = await getPollinationsTextModels(options);
    now += 60_000;
    const second = await getPollinationsTextModels(options);

    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves the last good response when refreshing the catalogue fails', async () => {
    let now = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [compatible()] }))
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const options = { fetchImpl, now: () => now };

    const cached = await getPollinationsTextModels(options);
    now += 5 * 60 * 1000 + 1;

    await expect(getPollinationsTextModels(options)).resolves.toEqual(cached);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed or unavailable responses when no cached result exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    await expect(getPollinationsTextModels({ fetchImpl })).rejects.toThrow('no compatible text models');
  });
});
