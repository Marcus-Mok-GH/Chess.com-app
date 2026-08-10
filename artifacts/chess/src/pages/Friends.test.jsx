import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Friends from './Friends';

vi.mock('../services/api', () => ({
  default: {
    getFriends: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn(),
  },
}));

vi.mock('../services/socket', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    joinPresence: vi.fn().mockResolvedValue(true),
    leavePresence: vi.fn(),
  },
}));

const mockUseUser = vi.fn();
vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

import api from '../services/api';
import socket from '../services/socket';

function makeUser(overrides = {}) {
  return { id: 'user_1', username: 'alice', elo: 1200, ...overrides };
}

function makeFriend(overrides = {}) {
  return {
    id: 'user_2',
    username: 'bob',
    status: 'active',
    online: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderFriends() {
  return render(
    <MemoryRouter initialEntries={['/friends']}>
      <Friends />
    </MemoryRouter>
  );
}

describe('Friends page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue({ user: makeUser(), isLoggedIn: true, isLoading: false });
    api.getFriends.mockResolvedValue({ friends: [], count: 0 });
    api.addFriend.mockResolvedValue({ success: true });
    api.removeFriend.mockResolvedValue({ success: true });
  });

  it('shows an empty state when the user has no friends', async () => {
    renderFriends();
    expect(await screen.findByText(/no friends yet/i)).toBeTruthy();
  });

  it('renders the friend list with usernames and online status', async () => {
    api.getFriends.mockResolvedValue({
      friends: [makeFriend({ online: true })],
      count: 1,
    });
    renderFriends();
    expect(await screen.findByText('bob')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('marks friends as offline when the API says so', async () => {
    api.getFriends.mockResolvedValue({
      friends: [makeFriend({ online: false })],
      count: 1,
    });
    renderFriends();
    expect(await screen.findByText('bob')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('adds a friend by username', async () => {
    renderFriends();
    await screen.findByText(/no friends yet/i);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'carol' } });
    fireEvent.click(screen.getByRole('button', { name: /add friend/i }));

    await waitFor(() => expect(api.addFriend).toHaveBeenCalledWith('carol'));
    expect(await screen.findByText(/carol added to your friends/i)).toBeTruthy();
  });

  it('does not call addFriend for an empty username', async () => {
    renderFriends();
    await screen.findByText(/no friends yet/i);
    const button = screen.getByRole('button', { name: /add friend/i });
    expect(button.disabled).toBe(true);
  });

  it('surfaces an error when adding a friend fails', async () => {
    api.addFriend.mockRejectedValue(new Error('User not found'));
    renderFriends();
    await screen.findByText(/no friends yet/i);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ghost' } });
    fireEvent.click(screen.getByRole('button', { name: /add friend/i }));

    expect(await screen.findByText('User not found')).toBeTruthy();
  });

  it('removes a friend and updates the list', async () => {
    api.getFriends.mockResolvedValue({
      friends: [makeFriend()],
      count: 1,
    });
    renderFriends();
    expect(await screen.findByText('bob')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /remove bob/i }));
    await waitFor(() => expect(api.removeFriend).toHaveBeenCalledWith('bob'));
    await waitFor(() => expect(screen.queryByText('bob')).toBeNull());
  });

  it('joins presence for the logged-in user', async () => {
    renderFriends();
    await screen.findByText(/no friends yet/i);
    expect(socket.joinPresence).toHaveBeenCalledWith({ id: 'user_1', username: 'alice' });
  });

  it('marks a friend online when a user:online event arrives', async () => {
    api.getFriends.mockResolvedValue({
      friends: [makeFriend({ online: false })],
      count: 1,
    });

    const handlers = {};
    socket.on.mockImplementation((event, cb) => { handlers[event] = cb; });

    renderFriends();
    expect(await screen.findByText('bob')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();

    await waitFor(() => expect(socket.on).toHaveBeenCalledWith('user:online', expect.any(Function)));
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith('user:offline', expect.any(Function)));

    handlers['user:online']({ userId: 'user_2' });

    expect(await screen.findByText('Online')).toBeTruthy();
  });
});
