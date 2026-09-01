import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetUsernameModal from './SetUsernameModal';

// Mock CSS import
vi.mock('./SetUsernameModal.css', () => ({}));

const mockUseUser = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

describe('SetUsernameModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when user does not need a username', () => {
    mockUseUser.mockReturnValue({
      user: { id: '123', needsUsername: false },
      updateUsername: vi.fn(),
      logout: vi.fn(),
    });

    const { container } = render(<SetUsernameModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with ARIA attributes when user needs a username', () => {
    mockUseUser.mockReturnValue({
      user: { id: '123', needsUsername: true },
      updateUsername: vi.fn(),
      logout: vi.fn(),
    });

    render(<SetUsernameModal />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('username-modal-title');

    const title = screen.getByText(/One last step!/i);
    expect(title.getAttribute('id')).toBe('username-modal-title');
  });

  it('displays validation error and connects it via aria-describedby when username is too short', async () => {
    mockUseUser.mockReturnValue({
      user: { id: '123', needsUsername: true },
      updateUsername: vi.fn(),
      logout: vi.fn(),
    });

    render(<SetUsernameModal />);

    const input = screen.getByLabelText(/Choose a username/i);
    fireEvent.change(input, { target: { value: 'a' } });

    const submitBtn = screen.getByRole('button', { name: /Set Username/i });
    fireEvent.click(submitBtn);

    const errorMessage = await screen.findByRole('alert');
    expect(errorMessage.textContent).toBe('Username is too short (min 2 chars).');
    expect(errorMessage.getAttribute('id')).toBe('username-error');

    expect(input.getAttribute('aria-describedby')).toBe('username-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('calls updateUsername with valid username on submission', async () => {
    const updateUsernameMock = vi.fn().mockResolvedValue({});
    mockUseUser.mockReturnValue({
      user: { id: '123', needsUsername: true },
      updateUsername: updateUsernameMock,
      logout: vi.fn(),
    });

    render(<SetUsernameModal />);

    const input = screen.getByLabelText(/Choose a username/i);
    fireEvent.change(input, { target: { value: 'ChessMaster99' } });

    const submitBtn = screen.getByRole('button', { name: /Set Username/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(updateUsernameMock).toHaveBeenCalledWith('ChessMaster99');
    });
  });

  it('calls logout when Cancel and Logout button is clicked', () => {
    const logoutMock = vi.fn();
    mockUseUser.mockReturnValue({
      user: { id: '123', needsUsername: true },
      updateUsername: vi.fn(),
      logout: logoutMock,
    });

    render(<SetUsernameModal />);

    const cancelBtn = screen.getByRole('button', { name: /Cancel and Logout/i });
    fireEvent.click(cancelBtn);

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
