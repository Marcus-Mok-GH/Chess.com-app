import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './RequireAuth';

const mockUseUser = vi.fn();

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

const remember = vi.fn();
vi.mock('../utils/postLoginPath', () => ({
  rememberPostLoginPath: (path) => remember(path),
}));

function renderAt(path = '/friends', fallback = <div>loading</div>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/friends"
          element={
            <RequireAuth fallback={fallback}>
              <div>friends content</div>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    mockUseUser.mockReset();
    remember.mockReset();
  });

  it('renders the page for a signed-in user', () => {
    mockUseUser.mockReturnValue({ isLoggedIn: true, isLoading: false });
    renderAt();
    expect(screen.getByText('friends content')).toBeTruthy();
    expect(remember).not.toHaveBeenCalled();
  });

  it('shows the fallback while the session is still resolving', () => {
    mockUseUser.mockReturnValue({ isLoggedIn: false, isLoading: true });
    renderAt();
    expect(screen.getByText('loading')).toBeTruthy();
    expect(screen.queryByText('login page')).toBeNull();
    expect(remember).not.toHaveBeenCalled();
  });

  it('sends a guest to /login and remembers where they were headed', async () => {
    mockUseUser.mockReturnValue({ isLoggedIn: false, isLoading: false });
    renderAt('/friends?tab=requests');
    await waitFor(() => expect(screen.getByText('login page')).toBeTruthy());
    expect(remember).toHaveBeenCalledWith('/friends?tab=requests');
  });
});
