import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../coachAuth.js', () => ({ getCoachToken: vi.fn() }));
vi.mock('../db.js', () => ({ query: vi.fn() }));

import { getCoachToken } from '../coachAuth.js';
import { callPollinations } from './botRunner.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('callPollinations', () => {
  it('uses the selected model and the bot creator’s server-side token', async () => {
    getCoachToken.mockResolvedValue('creator-token');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Nice move.' } }] }),
    });

    await expect(callPollinations('Say something', 'Be friendly', 'provider/model-a', 'creator-id'))
      .resolves.toBe('Nice move.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gen.pollinations.ai/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer creator-token');
    expect(JSON.parse(options.body)).toMatchObject({
      model: 'provider/model-a',
      messages: [
        { role: 'system', content: 'Be friendly' },
        { role: 'user', content: 'Say something' },
      ],
    });
  });

  it('uses the existing safe fallback when the creator has no linked account', async () => {
    getCoachToken.mockResolvedValue(null);

    const result = await callPollinations('Say something', 'Be friendly', 'provider/model-a', 'creator-id');

    expect(typeof result).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
