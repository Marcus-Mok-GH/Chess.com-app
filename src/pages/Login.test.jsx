import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';

const mockUseUser = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Login magic-link callback routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('redirects to /home after successful token_hash callback completion', async () => {
    const completeMagicLinkSignIn = vi.fn().mockResolvedValue({ success: true });
    mockUseUser.mockReturnValue({
      requestMagicLink: vi.fn(),
      completeMagicLinkSignIn,
      isLoading: false,
      isLoggedIn: false,
    });

    render(
      <MemoryRouter initialEntries={['/login?type=magiclink&username=tester&email=test%40mail.com&token_hash=abc123']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(completeMagicLinkSignIn).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true }));
  });

  it('accepts hash access_token callbacks and redirects to /home', async () => {
    window.location.hash = '#access_token=hash_token_123&type=magiclink';
    const completeMagicLinkSignIn = vi.fn().mockResolvedValue({ success: true });
    mockUseUser.mockReturnValue({
      requestMagicLink: vi.fn(),
      completeMagicLinkSignIn,
      isLoading: false,
      isLoggedIn: false,
    });

    render(
      <MemoryRouter initialEntries={['/login?type=magiclink&username=tester&email=test%40mail.com']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(completeMagicLinkSignIn).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true }));
  });
});
