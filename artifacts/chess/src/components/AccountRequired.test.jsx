import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AccountRequired from './AccountRequired';

function renderNotice(props = {}, initial = '/nowhere') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/nowhere" element={<AccountRequired {...props} />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/login" />
      </Routes>
    </MemoryRouter>
  );
}

describe('AccountRequired', () => {
  it('renders the default title and message', () => {
    renderNotice();

    expect(screen.getByText('Account required')).toBeTruthy();
    expect(screen.getByText(/You need an account to access this info/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /log in/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeTruthy();
  });

  it('renders a custom title and message', () => {
    renderNotice({ title: 'Clubs are for members', message: 'Log in to get started.' });

    expect(screen.getByText('Clubs are for members')).toBeTruthy();
    expect(screen.getByText('Log in to get started.')).toBeTruthy();
  });

  it('navigates to the login page', () => {
    renderNotice();
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByTestId('login-page')).toBeTruthy();
  });
});
