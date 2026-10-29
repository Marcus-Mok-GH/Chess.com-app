import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Subscription from './Subscription';

const { mockSubState, mockGetReviewUsage, mockGetSubscription } = vi.hoisted(() => ({
  mockSubState: { user: { username: 'kaya', id: 'u1' }, isLoading: false },
  mockGetReviewUsage: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockSubState,
}));

vi.mock('../engine/coach/coachAI', () => ({
  getReviewUsage: mockGetReviewUsage,
  getSubscription: mockGetSubscription,
}));

const FREE_USAGE = {
  used: 1,
  limit: 1,
  remaining: 0,
  unlimited: false,
  resetsAt: '2026-10-29T00:00:00.000Z',
};

const FREE_SUBSCRIPTION = {
  subscription: { active: false, status: 'inactive', currentPeriodEnd: null },
  offer: {
    checkoutUrl: 'https://whop.com/checkout/ch_test/',
    price: 7.99,
    currency: 'SGD',
    interval: 'month',
    label: 'Unlimited game reviews',
  },
};

const ACTIVE_SUBSCRIPTION = {
  subscription: {
    active: true,
    status: 'active',
    currentPeriodEnd: '2026-11-28T00:00:00.000Z',
  },
  offer: FREE_SUBSCRIPTION.offer,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <Subscription />
    </MemoryRouter>,
  );
}

describe('Subscription page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubState.user = { username: 'kaya', id: 'u1' };
    mockSubState.isLoading = false;
    mockGetReviewUsage.mockResolvedValue(FREE_USAGE);
    mockGetSubscription.mockResolvedValue(FREE_SUBSCRIPTION);
  });

  it('shows the free plan and the only checkout button in the app', async () => {
    const view = renderPage();

    expect(await screen.findByText('Free plan')).toBeTruthy();
    expect(
      screen.getByText(/Free accounts get 1 game review per day/),
    ).toBeTruthy();

    const upgrade = screen.getByRole('link', { name: /Upgrade — unlimited reviews/ });
    expect(upgrade.getAttribute('href')).toBe('https://whop.com/checkout/ch_test/');
    expect(upgrade.getAttribute('target')).toBe('_blank');

    expect(screen.getByText('Free review 1 of 1 used today')).toBeTruthy();
    expect(view).toBeTruthy();
  });

  it('shows an active plan without a checkout button', async () => {
    mockGetSubscription.mockResolvedValue(ACTIVE_SUBSCRIPTION);
    mockGetReviewUsage.mockResolvedValue({ ...FREE_USAGE, unlimited: true, used: 0 });

    renderPage();

    expect(await screen.findByText('Active')).toBeTruthy();
    expect(screen.getByText(/Renews/)).toBeTruthy();
    expect(screen.getByText(/Unlimited reviews — subscribed/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Upgrade/ })).toBeNull();
  });

  it('prompts guests to sign in instead of showing a price', async () => {
    mockSubState.user = null;

    renderPage();

    expect(
      await screen.findByText('Sign in to see your plan and upgrade options.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log In/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Upgrade/ })).toBeNull();
  });

  it('reports a failed load with a retry action', async () => {
    mockGetReviewUsage.mockRejectedValue(new Error('offline'));
    mockGetSubscription.mockRejectedValue(new Error('offline'));

    renderPage();

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeTruthy();

    mockGetReviewUsage.mockResolvedValue(FREE_USAGE);
    mockGetSubscription.mockResolvedValue(FREE_SUBSCRIPTION);
    retry.click();

    await waitFor(() => expect(screen.getByText('Free plan')).toBeTruthy());
  });
});