import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Helper to render Login at the /login route
function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>
  );
}

// Default mock values for the OTP-based login flow
function makeDefaultUserMock(overrides = {}) {
  return {
    requestOtp: vi.fn().mockResolvedValue({ success: true, message: 'Code sent! Check your email for an 8-digit verification code.' }),
    verifyEmailOtp: vi.fn().mockResolvedValue({ success: true }),
    isLoading: false,
    isLoggedIn: false,
    ...overrides,
  };
}

describe('Login OTP – 8-digit code (PR #1.1.65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Email step ────────────────────────────────────────────────────────────

  it('transitions to verify step after sending OTP code', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeTruthy());
  });

  // ── Verify step – UI text ─────────────────────────────────────────────────

  it('shows "8-digit code" in the verify-step subtitle', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    // Advance to verify step
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByText(/8-digit code/i));
    expect(screen.getByText(/8-digit code/i)).toBeTruthy();
  });

  // ── Verify step – input constraints ──────────────────────────────────────

  it('OTP input has maxLength of 8', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    const otpInput = screen.getByLabelText(/verification code/i);
    expect(otpInput.getAttribute('maxLength') || otpInput.maxLength.toString()).toBe('8');
  });

  it('OTP input has placeholder "00000000"', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    expect(screen.getByLabelText(/verification code/i).placeholder).toBe('00000000');
  });

  it('OTP input strips non-digit characters', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    const otpInput = screen.getByLabelText(/verification code/i);

    fireEvent.change(otpInput, { target: { value: 'abc12def34' } });
    expect(otpInput.value).toBe('1234');
  });

  it('OTP input truncates input to 8 digits', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    const otpInput = screen.getByLabelText(/verification code/i);

    fireEvent.change(otpInput, { target: { value: '123456789' } }); // 9 digits
    expect(otpInput.value).toBe('12345678');
  });

  // ── Verify step – button state ────────────────────────────────────────────

  it('Verify Code button is disabled when OTP is fewer than 8 digits', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    const otpInput = screen.getByLabelText(/verification code/i);
    const verifyBtn = screen.getByRole('button', { name: /verify code/i });

    // Empty
    expect(verifyBtn.disabled).toBe(true);

    // 7 digits – still disabled
    fireEvent.change(otpInput, { target: { value: '1234567' } });
    expect(verifyBtn.disabled).toBe(true);
  });

  it('Verify Code button is enabled when OTP is exactly 8 digits', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '12345678' } });

    expect(screen.getByRole('button', { name: /verify code/i }).disabled).toBe(false);
  });

  // ── Verify step – error message ───────────────────────────────────────────

  it('shows "Please enter the 8-digit code." error when verifying an empty OTP', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));

    // Bypass the disabled-button guard by pressing Enter on the input
    fireEvent.keyDown(screen.getByLabelText(/verification code/i), { key: 'Enter' });

    await waitFor(() => screen.getByText('Please enter the 8-digit code.'));
    expect(screen.getByText('Please enter the 8-digit code.')).toBeTruthy();
  });

  // ── Regression – 6-digit guard removed ───────────────────────────────────

  it('does NOT show the old 6-digit error message', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.keyDown(screen.getByLabelText(/verification code/i), { key: 'Enter' });

    await waitFor(() => screen.getByText('Please enter the 8-digit code.'));
    expect(screen.queryByText('Please enter the 6-digit code.')).toBeNull();
  });

  // ── Regression – 6-digit button guard removed ────────────────────────────

  it('does not enable Verify Code button at exactly 6 digits (old length)', async () => {
    mockUseUser.mockReturnValue(makeDefaultUserMock());
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '123456' } });

    expect(screen.getByRole('button', { name: /verify code/i }).disabled).toBe(true);
  });

  // ── Successful verification ───────────────────────────────────────────────

  it('navigates to /home after successful 8-digit OTP verification', async () => {
    const verifyEmailOtp = vi.fn().mockResolvedValue({ success: true });
    mockUseUser.mockReturnValue(makeDefaultUserMock({ verifyEmailOtp }));
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await waitFor(() => expect(verifyEmailOtp).toHaveBeenCalledWith({ email: 'test@example.com', token: '12345678' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true }));
  });
});

describe('Login magic-link callback routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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



  it('accepts query callbacks with type=email and redirects to /home', async () => {
    const completeMagicLinkSignIn = vi.fn().mockResolvedValue({ success: true });
    mockUseUser.mockReturnValue({
      requestMagicLink: vi.fn(),
      completeMagicLinkSignIn,
      isLoading: false,
      isLoggedIn: false,
    });

    render(
      <MemoryRouter initialEntries={['/login?type=email&username=tester&email=test%40mail.com&token_hash=abc123']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(completeMagicLinkSignIn).toHaveBeenCalled());
    expect(completeMagicLinkSignIn).toHaveBeenCalledWith(expect.objectContaining({ type: 'magiclink' }));
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
