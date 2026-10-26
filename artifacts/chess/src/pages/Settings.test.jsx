import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from './Settings';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import api from '../services/api';
import { getCoachStatus } from '../engine/coach/coachAI';
import { clearOnlineSession } from '../utils/gamePersistence';
import { I18nProvider } from '../i18n/I18nContext';

vi.mock('../contexts/SettingsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettings: vi.fn(),
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: vi.fn(),
}));

vi.mock('../services/api', () => ({
  default: { resignAllLiveGames: vi.fn() },
}));

vi.mock('../engine/coach/coachAI', () => ({
  getCoachStatus: vi.fn(),
  connectCoach: vi.fn(),
  disconnectCoach: vi.fn(),
}));

vi.mock('../utils/gamePersistence', () => ({
  clearOnlineSession: vi.fn(),
}));

const DEFAULT_TEST_SETTINGS = {
  language: 'en',
  showCoordinates: true,
  highlightMoves: true,
  boardTheme: 'green',
  pieceSet: 'default',
  autoQueen: true,
  confirmMoves: false,
  showHints: true,
  enablePremoves: true,
  soundEnabled: true,
  soundVolume: 80,
  hapticEnabled: true,
  debugMode: false,
};

const testUser = {
  username: 'patty',
  elo: 1200,
  bulletElo: 1300,
  blitzElo: 1290,
  rapidElo: 1210,
  classicalElo: 1205,
  gamesPlayed: 42,
  wins: 20,
  draws: 2,
  losses: 20,
};

function renderSettings() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<div data-testid="login-page" />} />
          <Route path="/privacy" element={<div data-testid="privacy-page" />} />
          <Route path="/terms" element={<div data-testid="terms-page" />} />
          <Route path="/changelog" element={<div data-testid="changelog-page" />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS },
      updateSettings: vi.fn(),
      resetSettings: vi.fn(),
      isLoaded: true,
    });
    useUser.mockReturnValue({ user: null, logout: vi.fn() });
    getCoachStatus.mockResolvedValue({ available: true, connected: true, configured: true });
  });

  it('renders section navigation and the main section headings', () => {
    renderSettings();

    expect(screen.getByRole('navigation', { name: /settings sections/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Display' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gameplay' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sound & Haptics' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Account' })).toBeNull();
  });

  it('offers the six supported languages and persists a selection through settings', () => {
    const updateSettings = vi.fn();
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS },
      updateSettings,
      resetSettings: vi.fn(),
      isLoaded: true,
    });
    renderSettings();

    const picker = screen.getByRole('combobox', { name: 'App language' });
    expect([...picker.options].map((option) => option.value)).toEqual([
      'en', 'zh-CN', 'zh-TW', 'ms', 'ta', 'hi',
    ]);
    fireEvent.change(picker, { target: { value: 'zh-TW' } });
    expect(updateSettings).toHaveBeenCalledWith({ language: 'zh-TW' });
  });

  it('does not render the inline privacy policy and links to the privacy page instead', () => {
    const { unmount } = renderSettings();

    expect(screen.queryByText(/Information We Collect/i)).toBeNull();

    const legalSection = document.getElementById('legal');
    fireEvent.click(within(legalSection).getAllByRole('button', { name: 'View' })[0]);
    expect(screen.getByTestId('privacy-page')).toBeTruthy();
    unmount();

    renderSettings();
    const legalSection2 = document.getElementById('legal');
    fireEvent.click(within(legalSection2).getAllByRole('button', { name: 'View' })[1]);
    expect(screen.getByTestId('terms-page')).toBeTruthy();
  });

  it('shows the guest note and navigates to login from the sign-in button', () => {
    renderSettings();

    expect(screen.getByText(/Guests can still play vs bots/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  it('wires each toggle to updateSettings with its label', () => {
    const updateSettings = vi.fn();
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS },
      updateSettings,
      resetSettings: vi.fn(),
      isLoaded: true,
    });
    renderSettings();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Coordinates' }));
    expect(updateSettings).toHaveBeenCalledWith({ showCoordinates: false });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-Promote to Queen' }));
    expect(updateSettings).toHaveBeenCalledWith({ autoQueen: false });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Premoves' }));
    expect(updateSettings).toHaveBeenCalledWith({ enablePremoves: false });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Haptic Feedback' }));
    expect(updateSettings).toHaveBeenCalledWith({ hapticEnabled: false });
  });

  it('changes the board theme with an active-state button', () => {
    const updateSettings = vi.fn();
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS, boardTheme: 'green' },
      updateSettings,
      resetSettings: vi.fn(),
      isLoaded: true,
    });
    renderSettings();

    const green = screen.getByRole('button', { name: 'Green' });
    expect(green.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    expect(updateSettings).toHaveBeenCalledWith({ boardTheme: 'blue' });
  });

  it('adjusts the sound volume through a labelled slider when sound is on', () => {
    const updateSettings = vi.fn();
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS },
      updateSettings,
      resetSettings: vi.fn(),
      isLoaded: true,
    });
    renderSettings();

    const slider = screen.getByRole('slider', { name: 'Sound volume' });
    expect(slider.getAttribute('aria-valuetext')).toBe('80%');
    fireEvent.change(slider, { target: { value: '50' } });
    expect(updateSettings).toHaveBeenCalledWith({ soundVolume: 50 });
  });

  it('hides the volume slider when sound effects are off', () => {
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS, soundEnabled: false },
      updateSettings: vi.fn(),
      resetSettings: vi.fn(),
      isLoaded: true,
    });
    renderSettings();

    expect(screen.queryByRole('slider', { name: 'Sound volume' })).toBeNull();
  });

  it('disables reset while settings already match the defaults', () => {
    renderSettings();

    const resetButton = screen.getByRole('button', { name: 'Reset to Defaults' });
    expect(resetButton.disabled).toBe(true);
  });

  it('requires a second confirmation click before resetting', () => {
    const resetSettings = vi.fn();
    useSettings.mockReturnValue({
      settings: { ...DEFAULT_TEST_SETTINGS, debugMode: true },
      updateSettings: vi.fn(),
      resetSettings,
      isLoaded: true,
    });
    renderSettings();

    const resetButton = screen.getByRole('button', { name: 'Reset to Defaults' });
    expect(resetButton.disabled).toBe(false);

    fireEvent.click(resetButton);
    expect(resetSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm reset' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(resetSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    expect(resetSettings).toHaveBeenCalledTimes(1);
  });

  describe('account section for signed-in users', () => {
    beforeEach(() => {
      useUser.mockReturnValue({ user: { ...testUser }, logout: vi.fn() });
    });

    it('shows account ratings and logs out on demand', () => {
      const logout = vi.fn();
      useUser.mockReturnValue({ user: { ...testUser }, logout });
      renderSettings();

      expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
      expect(screen.getByText('patty')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /log out/i }));
      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('resigns all live games only after armed confirmation', async () => {
      api.resignAllLiveGames.mockResolvedValue({ resignedCount: 2 });
      renderSettings();

      fireEvent.click(screen.getByRole('button', { name: 'Resign all live games' }));
      expect(api.resignAllLiveGames).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Confirm resign all' }));
      await waitFor(() => {
        expect(api.resignAllLiveGames).toHaveBeenCalledTimes(1);
      });

      expect(clearOnlineSession).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Resigned 2 live games.')).toBeTruthy();
    });

    it('reports a negative result without games', async () => {
      api.resignAllLiveGames.mockResolvedValue({ resignedCount: 0 });
      renderSettings();

      fireEvent.click(screen.getByRole('button', { name: 'Resign all live games' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm resign all' }));

      expect(await screen.findByText(/No ongoing online matchmaking games found/i)).toBeTruthy();
    });

    it('shows resign failures as alerts', async () => {
      api.resignAllLiveGames.mockRejectedValue(new Error('network down'));
      renderSettings();

      fireEvent.click(screen.getByRole('button', { name: 'Resign all live games' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm resign all' }));

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByText('network down')).toBeTruthy();
    });
  });

  describe('Pollinations AI section', () => {
    it('shows the connected status and lets signed-in users disconnect', async () => {
      useUser.mockReturnValue({ user: { ...testUser }, logout: vi.fn() });
      getCoachStatus.mockResolvedValue({ available: true, connected: true, configured: true });
      renderSettings();

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeTruthy();
      });
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    });

    it('surfaces status errors as alerts', async () => {
      getCoachStatus.mockRejectedValue(new Error('status check failed'));
      renderSettings();

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toBe('status check failed');
      });
    });

    it('routes guests to the sign-in page from the coach button', async () => {
      getCoachStatus.mockResolvedValue({ available: false, connected: false, configured: true });
      renderSettings();

      const connectButton = await screen.findByRole('button', { name: 'Sign in first' });
      fireEvent.click(connectButton);
      expect(screen.getByTestId('login-page')).toBeTruthy();
    });
  });
});
