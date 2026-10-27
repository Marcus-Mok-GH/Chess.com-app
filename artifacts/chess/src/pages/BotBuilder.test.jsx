import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BotBuilder from './BotBuilder';
import { api } from '../services/api';

vi.mock('../contexts/UserContext', () => ({
  useUser: () => ({ user: { isAdmin: true } }),
}));

vi.mock('../i18n/I18nContext', () => ({
  useI18n: () => ({ t: (value) => value }),
  useT: () => (value) => value,
}));

vi.mock('../services/api', () => ({
  api: {
    adminListBots: vi.fn(),
    adminListBotModels: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.adminListBots.mockResolvedValue({ bots: [] });
  api.adminListBotModels.mockResolvedValue({
    models: [{ id: 'pollinations/live-chat-model', title: 'Live Chat Model', paidOnly: false }],
    connected: true,
  });
});

describe('BotBuilder model picker', () => {
  it('uses the live catalogue rather than bundled model choices', async () => {
    render(<MemoryRouter><BotBuilder /></MemoryRouter>);
    await waitFor(() => expect(api.adminListBotModels).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole('button', { name: /Create Bot/i }))[0]);

    const select = await screen.findByLabelText('AI Model');
    await waitFor(() => expect(select.value).toBe('pollinations/live-chat-model'));
    expect(screen.getByRole('option', { name: 'Live Chat Model' })).toBeDefined();
    expect(screen.queryByRole('option', { name: /GPT-4o|Claude/i })).toBeNull();
  });
});

describe('BotBuilder bot loading', () => {
  it('shows a retry state instead of an empty list when loading fails', async () => {
    api.adminListBots.mockRejectedValue(new Error('database unavailable'));
    render(<MemoryRouter><BotBuilder /></MemoryRouter>);

    expect(await screen.findByText('Failed to load bots')).toBeDefined();
    api.adminListBots.mockResolvedValue({ bots: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No bots yet')).toBeDefined();
  });
});
