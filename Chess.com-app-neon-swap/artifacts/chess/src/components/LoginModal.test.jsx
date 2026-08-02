import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginModal from './LoginModal';

// Mock CSS import
vi.mock('./LoginModal.css', () => ({}));

const mockUseUser = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

// Default mock for the OTP-based flow
function makeDefaultUserMock(overrides = {}) {
  return {
    requestOtp: vi.fn().mockResolvedValue({
      success: true,
      message: 'Code sent! Check your email for a 6-digit verification code.',
    }),
    verifyEmailOtp: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

// Helper: render LoginModal and advance to the verify step
async function renderAtVerifyStep(userMock = makeDefaultUserMock(), props = {}) {
  const onClose = vi.fn();
  mockUseUser.mockReturnValue(userMock);
  render(<LoginModal onClose={onClose} {...props} />);

  // Fill email step and send code
  fireEvent.change(screen.getByLabelText(/choose a username/i), { target: { value: 'testuser' } });
  fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: /send code/i }));

  await waitFor(() => screen.getAllByText(/check your email/i));
  return { onClose };
}

describe('LoginModal OTP – 6-digit code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue(makeDefaultUserMock());
  });

  // ── Email step ────────────────────────────────────────────────────────────

  it('shows "6-digit code" hint text on the email step', () => {
    render(<LoginModal onClose={vi.fn()} />);

    expect(screen.getByText(/6-digit code/i)).toBeTruthy();
  });

  it('does not show "8-digit code" hint text on the email step', () => {
    render(<LoginModal onClose={vi.fn()} />);

    expect(screen.queryByText(/8-digit code/i)).toBeNull();
  });

  // ── Verify step – UI text ─────────────────────────────────────────────────

  it('shows "6-digit code" in the verify-step header', async () => {
    await renderAtVerifyStep();

    expect(screen.getByText(/6-digit code/i)).toBeTruthy();
  });

  it('does not mention "8-digit code" anywhere in the verify-step', async () => {
    await renderAtVerifyStep();

    expect(screen.queryByText(/8-digit code/i)).toBeNull();
  });

  // ── Verify step – input constraints ──────────────────────────────────────

  it('OTP input has maxLength of 6', async () => {
    await renderAtVerifyStep();

    const otpInput = screen.getByLabelText(/verification code/i);
    expect(otpInput.getAttribute('maxLength') || String(otpInput.maxLength)).toBe('6');
  });

  it('OTP input has placeholder "000000"', async () => {
    await renderAtVerifyStep();

    expect(screen.getByLabelText(/verification code/i).placeholder).toBe('000000');
  });

  it('OTP input strips non-digit characters', async () => {
    await renderAtVerifyStep();

    const otpInput = screen.getByLabelText(/verification code/i);
    fireEvent.change(otpInput, { target: { value: 'ab12cd34ef' } });
    expect(otpInput.value).toBe('1234');
  });

  it('OTP input truncates to 6 digits when more are entered', async () => {
    await renderAtVerifyStep();

    const otpInput = screen.getByLabelText(/verification code/i);
    fireEvent.change(otpInput, { target: { value: '1234567' } }); // 7 digits
    expect(otpInput.value).toBe('123456');
  });

  // ── Verify step – button state ────────────────────────────────────────────

  it('Verify Code button is disabled when OTP is empty', async () => {
    await renderAtVerifyStep();

    expect(screen.getByRole('button', { name: /verify code/i }).disabled).toBe(true);
  });

  it('Verify Code button is disabled when OTP has fewer than 6 digits', async () => {
    await renderAtVerifyStep();

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '12345' } });
    expect(screen.getByRole('button', { name: /verify code/i }).disabled).toBe(true);
  });

  it('Verify Code button is enabled when OTP is exactly 6 digits', async () => {
    await renderAtVerifyStep();

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '123456' } });
    expect(screen.getByRole('button', { name: /verify code/i }).disabled).toBe(false);
  });

  // ── Verify step – error message ───────────────────────────────────────────

  it('shows "Please enter the 6-digit code." when verifying with an empty input', async () => {
    await renderAtVerifyStep();

    // Press Enter on OTP input to trigger handleVerifyCode with incorrect length
    fireEvent.keyDown(screen.getByLabelText(/verification code/i), { key: 'Enter' });

    await waitFor(() => screen.getByText('Please enter the 6-digit code.'));
    expect(screen.getByText('Please enter the 6-digit code.')).toBeTruthy();
  });

  it('does not show the old "8-digit code" error message', async () => {
    await renderAtVerifyStep();

    fireEvent.keyDown(screen.getByLabelText(/verification code/i), { key: 'Enter' });

    await waitFor(() => screen.getByText('Please enter the 6-digit code.'));
    expect(screen.queryByText('Please enter the 8-digit code.')).toBeNull();
  });

  // ── Successful verification ───────────────────────────────────────────────

  it('calls verifyEmailOtp with the 6-digit token and closes modal on success', async () => {
    const verifyEmailOtp = vi.fn().mockResolvedValue({ success: true });
    const onClose = vi.fn();
    mockUseUser.mockReturnValue(makeDefaultUserMock({ verifyEmailOtp }));

    render(<LoginModal onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/choose a username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await waitFor(() =>
      expect(verifyEmailOtp).toHaveBeenCalledWith({ email: 'test@example.com', token: '123456' })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});