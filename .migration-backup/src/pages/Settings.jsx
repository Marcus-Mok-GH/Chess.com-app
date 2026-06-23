import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import './Settings.css';

const BOARD_THEMES = [
  { id: 'green', name: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'brown', name: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', name: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'purple', name: 'Purple', light: '#e8e0f0', dark: '#9070a0' },
];

export default function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { user, logout } = useUser();
  const navigate = useNavigate();

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1>Settings</h1>

        {!user && (
          <div className="settings-guest-note">
            Sign in to save settings and game history. Guests can play vs bots without saves or analysis.
          </div>
        )}

        <section className="settings-section">
          <h2>Display</h2>
          
          <div className="setting-item">
            <div className="setting-info">
              <label>Show Coordinates</label>
              <span className="setting-desc">Display rank and file labels on the board</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.showCoordinates}
                onChange={(e) => updateSettings({ showCoordinates: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Highlight Legal Moves</label>
              <span className="setting-desc">Show dots on squares where pieces can move</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.highlightMoves}
                onChange={(e) => updateSettings({ highlightMoves: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Board Theme</label>
              <span className="setting-desc">Choose your board color scheme</span>
            </div>
            <div className="theme-selector">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-option ${settings.boardTheme === theme.id ? 'active' : ''}`}
                  onClick={() => updateSettings({ boardTheme: theme.id })}
                  title={theme.name}
                >
                  <div className="theme-preview">
                    <div className="theme-square light" style={{ backgroundColor: theme.light }}></div>
                    <div className="theme-square dark" style={{ backgroundColor: theme.dark }}></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>Gameplay</h2>

          <div className="setting-item">
            <div className="setting-info">
              <label>Auto-Promote to Queen</label>
              <span className="setting-desc">Automatically promote pawns to queen</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoQueen}
                onChange={(e) => updateSettings({ autoQueen: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Confirm Moves</label>
              <span className="setting-desc">Require confirmation before making a move</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.confirmMoves}
                onChange={(e) => updateSettings({ confirmMoves: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Show Hints Button</label>
              <span className="setting-desc">Display the hint button during games</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.showHints}
                onChange={(e) => updateSettings({ showHints: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>Sound</h2>

          <div className="setting-item">
            <div className="setting-info">
              <label>Sound Effects</label>
              <span className="setting-desc">Play sounds for moves and game events</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {settings.soundEnabled && (
            <div className="setting-item">
              <div className="setting-info">
                <label>Volume</label>
                <span className="setting-desc">{settings.soundVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.soundVolume}
                onChange={(e) => updateSettings({ soundVolume: parseInt(e.target.value) })}
                className="volume-slider"
              />
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2>Haptics</h2>

          <div className="setting-item">
            <div className="setting-info">
              <label>Haptic Feedback</label>
              <span className="setting-desc">Vibrate on moves and captures (mobile only)</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.hapticEnabled}
                onChange={(e) => updateSettings({ hapticEnabled: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>Advanced</h2>

          <div className="setting-item">
            <div className="setting-info">
              <label>Debug Mode</label>
              <span className="setting-desc">Show AI thinking and evaluation data</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(e) => updateSettings({ debugMode: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>About</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label>Changelog</label>
              <span className="setting-desc">See recent updates and fixes</span>
            </div>
            <button className="link-button" type="button" onClick={() => navigate('/changelog')}>
              View
            </button>
          </div>
        </section>

        {user && (
          <section className="settings-section">
            <h2>Account</h2>
            <div className="account-info">
              <div className="account-row">
                <span className="account-label">Username</span>
                <span className="account-value">{user.username}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Rating</span>
                <span className="account-value">{user.elo}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Games Played</span>
                <span className="account-value">{user.gamesPlayed || 0}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Record</span>
                <span className="account-value">
                  {user.wins || 0}W / {user.draws || 0}D / {user.losses || 0}L
                </span>
              </div>
            </div>
            <button className="logout-btn" onClick={logout}>
              Log Out
            </button>
          </section>
        )}

        <div className="settings-actions">
          <button className="reset-btn" onClick={resetSettings}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
