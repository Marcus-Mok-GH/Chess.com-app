import { useNavigate, useLocation } from 'react-router-dom';
import { useSettings, DEFAULT_SETTINGS } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Palette,
  Volume2,
  Smartphone,
  Bug,
  Settings2,
  User2,
  RotateCcw,
  LogOut,
  ScrollText,
  MousePointer2,
  Eye,
  Crosshair,
  Crown,
  Info,
  ShieldCheck,
  Flag,
  BrainCircuit,
  Zap,
} from 'lucide-react';
import { connectCoach, disconnectCoach, getCoachStatus } from '../engine/coach/coachAI';
import api from '../services/api';
import { clearOnlineSession } from '../utils/gamePersistence';
import './Settings.css';

const BOARD_THEMES = [
  { id: 'green', name: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'brown', name: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', name: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'purple', name: 'Purple', light: '#e8e0f0', dark: '#9070a0' },
];

const CONFIRM_TIMEOUT_MS = 5000;

function Toggle({ checked, onChange, label, id }) {
  return (
    <span className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        id={id}
        aria-describedby={id ? `${id}-desc` : undefined}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </span>
  );
}

function ConfirmActionButton({
  idle,
  confirm,
  busyLabel = 'Working...',
  busy = false,
  disabled = false,
  danger = false,
  icon: Icon,
  className = '',
  onConfirm,
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const disarm = () => {
    setArmed(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = async () => {
    if (disabled || busy) return;
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS);
      return;
    }
    disarm();
    await onConfirm?.();
  };

  return (
    <span className="confirm-action-group">
      <button
        className={`${className}${armed ? ' armed' : ''}`}
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        aria-disabled={disabled && !armed}
      >
        {Icon && <Icon size={15} aria-hidden="true" />}
        <span>{busy ? busyLabel : armed ? confirm : idle}</span>
      </button>
      {armed && !busy && (
        <button className="confirm-cancel-btn" type="button" onClick={disarm}>
          Cancel
        </button>
      )}
    </span>
  );
}

function SettingRow({ id, icon: Icon, label, desc, children }) {
  return (
    <div className="setting-item">
      <div className="setting-info">
        <div className="setting-title">
          {Icon && <Icon className="setting-icon" size={16} aria-hidden="true" />}
          {id ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
        </div>
        {desc && (
          <span className="setting-desc" id={id ? `${id}-desc` : undefined}>
            {desc}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Section({ id, icon: Icon, title, children }) {
  return (
    <section className="settings-section" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="section-header">
        {Icon && (
          <span className="section-icon" aria-hidden="true">
            <Icon size={15} />
          </span>
        )}
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [coachStatus, setCoachStatus] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState(null);
  const [resigningGames, setResigningGames] = useState(false);
  const [resignMessage, setResignMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCoachStatus() {
      setCoachLoading(true);
      try {
        const status = await getCoachStatus(true);
        if (isMounted) setCoachStatus(status);
      } catch (error) {
        if (isMounted) setCoachError(error.message || 'Unable to check Pollinations AI status.');
      } finally {
        if (isMounted) setCoachLoading(false);
      }
    }
    loadCoachStatus();
    return () => { isMounted = false; };
  }, [user]);

  async function handleCoachConnect() {
    if (!user) { navigate('/login'); return; }
    setCoachBusy(true);
    setCoachError(null);
    try {
      await connectCoach();
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.message?.toLowerCase().includes('log in')) {
        navigate('/login');
        return;
      }
      setCoachError(error.message || 'Unable to open Pollinations AI login.');
    } finally {
      setCoachBusy(false);
    }
  }

  async function handleCoachDisconnect() {
    setCoachBusy(true);
    setCoachError(null);
    try {
      await disconnectCoach();
      setCoachStatus((status) => status ? { ...status, connected: false } : status);
    } catch (error) {
      setCoachError(error.message || 'Unable to disconnect Pollinations AI.');
    } finally {
      setCoachBusy(false);
    }
  }

  async function resignAllLiveGames() {
    if (!user || resigningGames) return;
    setResigningGames(true);
    setResignMessage(null);
    try {
      const result = await api.resignAllLiveGames();
      clearOnlineSession();
      const count = Number(result?.resignedCount) || 0;
      setResignMessage({
        type: 'success',
        text: count === 0
          ? 'No ongoing online matchmaking games found.'
          : `Resigned ${count} live game${count === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      setResignMessage({ type: 'error', text: error.message || 'Unable to resign live games.' });
    } finally {
      setResigningGames(false);
    }
  }

  const settingsUnchanged = useMemo(
    () => JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS),
    [settings],
  );

  const sections = useMemo(() => {
    const list = [];
    if (user) list.push({ id: 'account', label: 'Account' });
    list.push({ id: 'display', label: 'Display' });
    list.push({ id: 'gameplay', label: 'Gameplay' });
    list.push({ id: 'sound', label: 'Sound' });
    list.push({ id: 'pollinations', label: 'AI coach' });
    list.push({ id: 'advanced', label: 'Advanced' });
    list.push({ id: 'about', label: 'About' });
    list.push({ id: 'legal', label: 'Privacy & terms' });
    return list;
  }, [user]);

  const handleNavClick = useCallback((event, id) => {
    const element = document.getElementById(id);
    if (!element) return;
    event.preventDefault();
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const hash = location.hash.slice(1);
    if (!hash) return undefined;
    // Wait for lazy-loaded content to mount
    const timer = setTimeout(() => {
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        element.focus({ preventScroll: true });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [location.hash]);

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <span className="settings-header-icon">
            <Settings2 size={22} aria-hidden="true" />
          </span>
          <div>
            <h1>Settings</h1>
            <p className="settings-subtitle">Board, sound, and account preferences</p>
          </div>
        </div>

        <nav className="settings-quick-nav" aria-label="Settings sections">
          {sections.map((section) => (
            <a
              key={section.id}
              className="settings-nav-chip"
              href={`#${section.id}`}
              onClick={(e) => handleNavClick(e, section.id)}
            >
              {section.label}
            </a>
          ))}
        </nav>

        {!user && (
          <div className="settings-guest-note" role="note">
            <Info size={16} aria-hidden="true" />
            <span>
              Sign in to save settings and game history. Guests can still play vs bots without
              saves or analysis.
            </span>
            <button className="link-button guest-signin-btn" type="button" onClick={() => navigate('/login')}>
              Sign in
            </button>
          </div>
        )}

        {user && (
          <Section id="account" icon={User2} title="Account">
            <div className="account-grid">
              <div className="account-row account-row-wide">
                <span className="account-label">Username</span>
                <span className="account-value">{user.username}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Unlimited</span>
                <span className="account-value account-value-elo">{user.elo}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Bullet</span>
                <span className="account-value account-value-elo">
                  {user.bulletElo ?? user.elo}
                </span>
              </div>
              <div className="account-row">
                <span className="account-label">Blitz</span>
                <span className="account-value account-value-elo">
                  {user.blitzElo ?? user.elo}
                </span>
              </div>
              <div className="account-row">
                <span className="account-label">Rapid</span>
                <span className="account-value account-value-elo">
                  {user.rapidElo ?? user.elo}
                </span>
              </div>
              <div className="account-row">
                <span className="account-label">Classical</span>
                <span className="account-value account-value-elo">
                  {user.classicalElo ?? user.elo}
                </span>
              </div>
              <div className="account-row">
                <span className="account-label">Rated Games</span>
                <span className="account-value">{user.gamesPlayed || 0}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Rated Record</span>
                <span className="account-value record">
                  <span className="rec-w">{user.wins || 0}W</span>
                  <span className="rec-d">{user.draws || 0}D</span>
                  <span className="rec-l">{user.losses || 0}L</span>
                </span>
              </div>
            </div>
            <div className="setting-item danger-setting-item">
              <div className="setting-info">
                <div className="setting-title">
                  <Flag className="setting-icon" size={16} aria-hidden="true" />
                  <span>Live games</span>
                </div>
                <span className="setting-desc">Resign every ongoing game started through online matchmaking.</span>
                {resignMessage && (
                  <span
                    className={`setting-feedback ${resignMessage.type}`}
                    role={resignMessage.type === 'error' ? 'alert' : 'status'}
                  >
                    {resignMessage.text}
                  </span>
                )}
              </div>
              <ConfirmActionButton
                idle="Resign all live games"
                confirm="Confirm resign all"
                busy={resigningGames}
                busyLabel="Resigning..."
                danger
                icon={Flag}
                className="danger-btn"
                onConfirm={resignAllLiveGames}
              />
            </div>
            <button className="logout-btn" onClick={logout} type="button">
              <LogOut size={16} aria-hidden="true" />
              <span>Log Out</span>
            </button>
          </Section>
        )}

        <Section id="display" icon={Palette} title="Display">
          <SettingRow
            id="setting-coordinates"
            icon={Eye}
            label="Show Coordinates"
            desc="Display rank and file labels on the board"
          >
            <Toggle
              id="setting-coordinates"
              label="Show Coordinates"
              checked={settings.showCoordinates}
              onChange={(v) => updateSettings({ showCoordinates: v })}
            />
          </SettingRow>

          <SettingRow
            id="setting-highlight"
            icon={Crosshair}
            label="Highlight Legal Moves"
            desc="Show dots on squares where pieces can move"
          >
            <Toggle
              id="setting-highlight"
              label="Highlight Legal Moves"
              checked={settings.highlightMoves}
              onChange={(v) => updateSettings({ highlightMoves: v })}
            />
          </SettingRow>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-title">
                <Palette className="setting-icon" size={16} aria-hidden="true" />
                <span>Board Theme</span>
              </div>
              <span className="setting-desc">Choose your board color scheme</span>
            </div>
            <div className="theme-selector" role="group" aria-label="Board theme">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={settings.boardTheme === theme.id ? 'theme-option active' : 'theme-option'}
                  aria-pressed={settings.boardTheme === theme.id}
                  onClick={() => updateSettings({ boardTheme: theme.id })}
                  title={`${theme.name} board theme`}
                  type="button"
                >
                  <div className="theme-preview" aria-hidden="true">
                    <div className="theme-square light" style={{ backgroundColor: theme.light }} />
                    <div className="theme-square dark" style={{ backgroundColor: theme.dark }} />
                  </div>
                  <span className="theme-name">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section id="gameplay" icon={Settings2} title="Gameplay">
          <SettingRow
            id="setting-auto-queen"
            icon={Crown}
            label="Auto-Promote to Queen"
            desc="Automatically promote pawns to queen"
          >
            <Toggle
              id="setting-auto-queen"
              label="Auto-Promote to Queen"
              checked={settings.autoQueen}
              onChange={(v) => updateSettings({ autoQueen: v })}
            />
          </SettingRow>

          <SettingRow
            id="setting-confirm-moves"
            icon={MousePointer2}
            label="Confirm Moves"
            desc="Require confirmation before making a move"
          >
            <Toggle
              id="setting-confirm-moves"
              label="Confirm Moves"
              checked={settings.confirmMoves}
              onChange={(v) => updateSettings({ confirmMoves: v })}
            />
          </SettingRow>

          <SettingRow
            id="setting-hints-button"
            icon={Settings2}
            label="Show Hints Button"
            desc="Display the hint button during games"
          >
            <Toggle
              id="setting-hints-button"
              label="Show Hints Button"
              checked={settings.showHints}
              onChange={(v) => updateSettings({ showHints: v })}
            />
          </SettingRow>

          <SettingRow
            id="setting-enable-premoves"
            icon={Zap}
            label="Enable Premoves"
            desc="Queue your next move while it is your opponent's turn; it plays automatically when your turn starts, if it is still legal."
          >
            <Toggle
              id="setting-enable-premoves"
              label="Enable Premoves"
              checked={settings.enablePremoves}
              onChange={(v) => updateSettings({ enablePremoves: v })}
            />
          </SettingRow>
        </Section>

        <Section id="sound" icon={Volume2} title="Sound & Haptics">
          <SettingRow
            id="setting-sound"
            icon={Volume2}
            label="Sound Effects"
            desc="Play sounds for moves and game events"
          >
            <Toggle
              id="setting-sound"
              label="Sound Effects"
              checked={settings.soundEnabled}
              onChange={(v) => updateSettings({ soundEnabled: v })}
            />
          </SettingRow>

          {settings.soundEnabled && (
            <div className="setting-item setting-item-vertical">
              <div className="setting-info">
                <div className="setting-title">
                  <Volume2 className="setting-icon" size={16} aria-hidden="true" />
                  <span>Volume</span>
                  <span className="volume-value" aria-hidden="true">{settings.soundVolume}%</span>
                </div>
                <span className="setting-desc" id="settings-volume-desc">Adjust the sound effect loudness</span>
              </div>
              <input
                id="settings-volume"
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.soundVolume}
                onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
                className="volume-slider"
                aria-label="Sound volume"
                aria-describedby="settings-volume-desc"
                aria-valuetext={`${settings.soundVolume}%`}
              />
            </div>
          )}

          <SettingRow
            id="setting-haptics"
            icon={Smartphone}
            label="Haptic Feedback"
            desc="Vibrate on moves and captures (mobile only)"
          >
            <Toggle
              id="setting-haptics"
              label="Haptic Feedback"
              checked={settings.hapticEnabled}
              onChange={(v) => updateSettings({ hapticEnabled: v })}
            />
          </SettingRow>
        </Section>

        <Section id="pollinations" icon={BrainCircuit} title="Pollinations AI">
          <div className="setting-item pollinations-auth-item" aria-busy={coachLoading || coachBusy}>
            <div className="setting-info">
              <div className="setting-title">
                <BrainCircuit className="setting-icon" size={16} aria-hidden="true" />
                <span>Analysis Authenticator</span>
                <span className="pollinations-status" role="status">
                  {coachLoading
                    ? 'Checking…'
                    : coachStatus?.connected
                      ? 'Connected'
                      : 'Not connected'}
                </span>
              </div>
              <span className="setting-desc">
                Log in with Pollinations AI so game review can use your authorized analysis provider.
              </span>
              {coachStatus?.configured === false && (
                <span className="setting-desc pollinations-warning">
                  Server-side Pollinations OAuth is not configured yet.
                </span>
              )}
              {coachError && (
                <span className="setting-desc pollinations-warning" role="alert">{coachError}</span>
              )}
            </div>
            <button
              className={coachStatus?.connected ? 'link-button pollinations-disconnect' : 'link-button'}
              type="button"
              onClick={coachStatus?.connected ? handleCoachDisconnect : handleCoachConnect}
              disabled={coachLoading || coachBusy}
            >
              {coachLoading || coachBusy
                ? 'Checking...'
                : coachStatus?.connected
                  ? 'Disconnect'
                  : user
                    ? 'Log in with Pollinations AI'
                    : 'Sign in first'}
            </button>
          </div>
        </Section>

        <Section id="advanced" icon={Bug} title="Advanced">
          <SettingRow
            id="setting-debug"
            icon={Bug}
            label="Debug Mode"
            desc="Show AI thinking and evaluation data"
          >
            <Toggle
              id="setting-debug"
              label="Debug Mode"
              checked={settings.debugMode}
              onChange={(v) => updateSettings({ debugMode: v })}
            />
          </SettingRow>
        </Section>

        <Section id="about" icon={ScrollText} title="About">
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-title">
                <ScrollText className="setting-icon" size={16} aria-hidden="true" />
                <span>Changelog</span>
              </div>
              <span className="setting-desc">See recent updates and fixes</span>
            </div>
            <button className="link-button" type="button" onClick={() => navigate('/changelog')}>
              View
            </button>
          </div>
        </Section>

        <Section id="legal" icon={ShieldCheck} title="Privacy & Terms">
          <div className="setting-item" id="privacy">
            <div className="setting-info">
              <div className="setting-title">
                <ShieldCheck className="setting-icon" size={16} aria-hidden="true" />
                <span>Privacy Policy</span>
              </div>
              <span className="setting-desc">Read the full Privacy Policy on its dedicated page.</span>
            </div>
            <button className="link-button" type="button" onClick={() => navigate('/privacy')}>
              View
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-title">
                <ShieldCheck className="setting-icon" size={16} aria-hidden="true" />
                <span>Terms of Service</span>
              </div>
              <span className="setting-desc">Read the full Terms of Service on its dedicated page.</span>
            </div>
            <button className="link-button" type="button" onClick={() => navigate('/terms')}>
              View
            </button>
          </div>
        </Section>

        <div className="settings-footer">
          <div className="footer-info">
            <span className="footer-title">
              <RotateCcw size={15} aria-hidden="true" />
              <span>Reset preferences</span>
            </span>
            <span className="setting-desc">
              {settingsUnchanged
                ? 'You are already using the default settings.'
                : 'Restores board, gameplay, sound, and account settings to their defaults.'}
            </span>
          </div>
          <ConfirmActionButton
            idle="Reset to Defaults"
            confirm="Confirm reset"
            busyLabel="Resetting..."
            disabled={settingsUnchanged}
            icon={RotateCcw}
            className="reset-btn"
            onConfirm={() => resetSettings()}
          />
        </div>
      </div>
    </div>
  );
}
