import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import VerifyEmail from './VerifyEmail';
import { useUser } from '../contexts/UserContext';

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock('../contexts/UserContext', () => ({
  useUser: vi.fn(),
  UserProvider: ({ children }) => <div>{children}</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeDefaultUserMock(overrides = {}) {
  return {
    requestOtp: vi.fn().mockResolvedValue({ success: true, message: 'Code sent!' }),
    verifyEmailOtp: vi.fn().mockResolvedValue({ success: true }),
    isLoading: false,
    isLoggedIn: false,
    isAwaitingVerification: false,
    pendingOtpEmail: 'test@example.com',
    logout: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUser.mockReturnValue(makeDefaultUserMock());
  });

  it('calls requestOtp after clicking send code', async () => {
    const requestOtp = vi.fn().mockResolvedValue({ success: true, message: 'Code sent!' });
    useUser.mockReturnValue(makeDefaultUserMock({ requestOtp }));

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/email/i);
    const sendCodeBtn = screen.getByRole('button', { name: /send code/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(sendCodeBtn);

    expect(requestOtp).toHaveBeenCalledWith({ email: 'test@example.com', username: 'testuser' });
  });
});

describe('VerifyEmail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUser.mockReturnValue(makeDefaultUserMock({ isAwaitingVerification: true }));
  });

  it('shows "6-digit code" in the verify-step subtitle', async () => {
    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText((content, element) => {
      return element.tagName.toLowerCase() === 'p' && content.includes('6-digit code');
    })).toBeTruthy();
  });

  it('OTP input has maxLength of 6', async () => {
    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );

    const otpInput = screen.getByLabelText(/verification code/i);
    expect(otpInput.getAttribute('maxLength') || otpInput.maxLength.toString()).toBe('6');
  });

  it('Verify Code button is enabled when OTP is exactly 6 digits', async () => {
    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );

    const otpInput = screen.getByLabelText(/verification code/i);
    fireEvent.change(otpInput, { target: { value: '123456' } });

    expect(screen.getByRole('button', { name: /verify code/i }).disabled).toBe(false);
  });

  it('calls verifyEmailOtp after clicking verify code', async () => {
    const verifyEmailOtp = vi.fn().mockResolvedValue({ success: true });
    useUser.mockReturnValue(makeDefaultUserMock({ isAwaitingVerification: true, verifyEmailOtp }));

    render(
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );

    const otpInput = screen.getByLabelText(/verification code/i);
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await waitFor(() => expect(verifyEmailOtp).toHaveBeenCalledWith({ email: 'test@example.com', token: '123456' }));
  });
});
