import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { UserProvider, useUser } from './UserContext';

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock('../services/api', () => ({
  default: {
    login: vi.fn(),
    getUser: vi.fn(),
    updateElo: vi.fn(),
  },
}));

vi.mock('../services/socket', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    joinAuthRoom: vi.fn(),
  },
}));

vi.mock('../services/neonAuth', () => ({
  neonAuth: {
    emailOtp: {
      sendVerificationOtp: vi.fn(),
    },
    signIn: {
      emailOtp: vi.fn(),
    },
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    signOut: vi.fn(),
  },
}));

import { neonAuth } from '../services/neonAuth';

// ── Test helper ───────────────────────────────────────────────────────────────

/**
 * Render a component that exposes the useUser context value through a callback.
 */
function renderWithUserContext(onValue) {
  function TestChild() {
    const ctx = useUser();
    onValue(ctx);
    return null;
  }
  render(
    <UserProvider>
      <TestChild />
    </UserProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserContext.requestOtp – 6-digit code message (PR #1.1.65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    neonAuth.getSession.mockResolvedValue({ data: { session: null } });
    // Simulate being online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    localStorage.clear();
  });

  it('returns a success message referencing a 6-digit verification code', async () => {
    neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('6-digit');
  });

  it('success message does NOT reference a 8-digit code (regression)', async () => {
    neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.message).not.toContain('8-digit');
  });

  it('returns the exact success message string', async () => {
    neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.message).toBe('Code sent! Check your email for a 6-digit verification code.');
  });

  it('calls neonAuth.emailOtp.sendVerificationOtp with the correct email', async () => {
    neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    await act(async () => {
      await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(neonAuth.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' })
    );
  });

  it('returns an error when neonAuth.emailOtp.sendVerificationOtp fails', async () => {
    neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({ error: { message: 'Rate limit exceeded' } });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.success).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it('returns an error when called offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.error).toBeTruthy();
    expect(neonAuth.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
  });

  // Boundary / negative cases ─────────────────────────────────────────────

  it('returns an error when email is empty', async () => {
    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: '', username: 'testuser' });
    });

    expect(result.error).toBeTruthy();
    expect(neonAuth.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it('returns an error when username is too short', async () => {
    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'x' });
    });

    expect(result.error).toBeTruthy();
    expect(neonAuth.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
  });

  describe('logout', () => {
    it('clears local state even if remote signOut fails', async () => {
      // Mock failure
      neonAuth.signOut.mockRejectedValue(new Error('Network error'));

      // Setup some session data in localStorage
      localStorage.setItem('chess_user_session', 'testuser');

      let capturedContext;
      renderWithUserContext((ctx) => { capturedContext = ctx; });

      // Mock window.location.href to prevent actual navigation in JSDOM
      const assignMock = vi.fn();
      const originalLocation = window.location;

      vi.stubGlobal('location', {
        ...originalLocation,
        assign: assignMock,
        href: 'http://localhost/settings',
        pathname: '/settings'
      });

      // In JSDOM, setting location.href doesn't update location.pathname automatically
      // when stubbed like this. We mock the behavior.
      const locationStub = {
        ...originalLocation,
        assign: assignMock,
        href: 'http://localhost/settings',
        pathname: '/settings'
      };

      Object.defineProperty(locationStub, 'href', {
        set: (val) => {
          if (val === '/') locationStub.pathname = '/';
          return val;
        },
        get: () => 'http://localhost' + locationStub.pathname
      });

      vi.stubGlobal('location', locationStub);

      await act(async () => {
        await capturedContext.logout();
      });

      // Local state should be cleared
      expect(capturedContext.user).toBeNull();
      expect(localStorage.getItem('chess_user_session')).toBeNull();
      expect(window.location.pathname).toBe('/');

      vi.unstubAllGlobals();
    });

    it('clears local state when remote signOut succeeds', async () => {
      neonAuth.signOut.mockResolvedValue();

      localStorage.setItem('chess_user_session', 'testuser');

      let capturedContext;
      renderWithUserContext((ctx) => { capturedContext = ctx; });

      const assignMock = vi.fn();
      const originalLocation = window.location;

      const locationStub = {
        ...originalLocation,
        assign: assignMock,
        href: 'http://localhost/settings',
        pathname: '/settings'
      };

      Object.defineProperty(locationStub, 'href', {
        set: (val) => {
          if (val === '/') locationStub.pathname = '/';
          return val;
        },
        get: () => 'http://localhost' + locationStub.pathname
      });

      vi.stubGlobal('location', locationStub);

      await act(async () => {
        await capturedContext.logout();
      });

      expect(capturedContext.user).toBeNull();
      expect(localStorage.getItem('chess_user_session')).toBeNull();
      expect(window.location.pathname).toBe('/');

      vi.unstubAllGlobals();
    });
  });
});