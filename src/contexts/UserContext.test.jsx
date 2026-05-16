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

const mockSignInWithOtp = vi.fn();
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});
const mockSetSession = vi.fn();
const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      setSession: mockSetSession,
      signOut: mockSignOut,
      verifyOtp: mockVerifyOtp,
    },
  },
}));

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

describe('UserContext.requestOtp – 8-digit code message (PR #1.1.65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    // Simulate being online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    localStorage.clear();
  });

  it('returns a success message referencing an 8-digit verification code', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('8-digit');
  });

  it('success message does NOT reference a 6-digit code (regression)', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.message).not.toContain('6-digit');
  });

  it('returns the exact success message string', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(result.message).toBe('Code sent! Check your email for an 8-digit verification code.');
  });

  it('calls supabase.auth.signInWithOtp with the correct email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    await act(async () => {
      await capturedContext.requestOtp({ email: 'user@example.com', username: 'testuser' });
    });

    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' })
    );
  });

  it('returns an error when supabase.auth.signInWithOtp fails', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Rate limit exceeded' } });

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
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
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
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('returns an error when username is too short', async () => {
    let capturedContext;
    renderWithUserContext((ctx) => { capturedContext = ctx; });

    let result;
    await act(async () => {
      result = await capturedContext.requestOtp({ email: 'user@example.com', username: 'x' });
    });

    expect(result.error).toBeTruthy();
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });
});