import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
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
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import './Settings.css';

const BOARD_THEMES = [
  { id: 'green', name: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'brown', name: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', name: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'purple', name: 'Purple', light: '#e8e0f0', dark: '#9070a0' },
];

const TERMS_SECTIONS = [
  ['Acceptance of Terms', 'By accessing and using this Chess application, you accept and agree to be bound by the terms and provisions of this agreement.'],
  ['Description of Service', 'This application provides a chess playing platform with features including online play, game analysis, and user accounts.'],
  ['User Accounts', 'You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.'],
  ['Acceptable Use', 'You agree not to use the service for any unlawful purpose or in any way that could damage, disable, or impair the service.'],
  ['Intellectual Property', 'The application and its original content are the exclusive property of the application providers.'],
  ['Disclaimer', 'The service is provided "as is" without warranties of any kind, either express or implied.'],
  ['Limitation of Liability', 'We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.'],
  ['Changes to Terms', 'We reserve the right to modify these terms at any time. Continued use after changes constitutes acceptance of modified terms.'],
  ['Contact', 'If you have any questions about these Terms, please contact us.'],
];

const PRIVACY_SECTIONS = [
  ['Information We Collect', 'We collect information you provide directly, such as email address for account creation and gameplay data.'],
  ['How We Use Your Information', 'We use the information to provide, maintain, and improve our services, communicate with you, and ensure security.'],
  ['Data Storage and Security', 'We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, or destruction.'],
  ['Sharing of Information', 'We do not sell or share your personal information with third parties except as described in this policy or with your consent.'],
  ['Cookies and Tracking', 'We may use cookies and similar tracking technologies to track activity on our service and hold certain information.'],
  ['Your Rights', 'You have the right to access, correct, or delete your personal data. Contact us to exercise these rights.'],
  ["Children's Privacy", 'Our service is not directed at children under 13. We do not knowingly collect personal information from children.'],
  ['Changes to Privacy Policy', 'We may update our Privacy Policy from time to time. We will notify users of any changes by posting the new policy on this page.'],
  ['Contact', 'For questions about this Privacy Policy, please contact us.'],
];

function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

function SettingRow({ icon: Icon, label, desc, children }) {
  return (
    <div className="setting-item">
      <div className="setting-info">
        <div className="setting-title">
          {Icon && <Icon className="setting-icon" size={16} />}
          <span>{label}</span>
        </div>
        {desc && <span className="setting-desc">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="settings-section">
      <div className="section-header">
        {Icon && (
          <span className="section-icon">
            <Icon size={15} />
          </span>
        )}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { user, logout } = useUser();
  const navigate = useNavigate();

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <span className="settings-header-icon">
            <Settings2 size={22} />
          </span>
          <div>
            <h1>Settings</h1>
            <p className="settings-subtitle">Personalize your experience</p>
          </div>
        </div>

        {!user && (
          <div className="settings-guest-note">
            <CheckCircle2 size={16} />
            <span>
              Sign in to save settings and game history. Guests can play vs bots without saves or
              analysis.
            </span>
          </div>
        )}

        <Section icon={Palette} title="Display">
          <SettingRow
            icon={Eye}
            label="Show Coordinates"
            desc="Display rank and file labels on the board"
          >
            <Toggle
              label="Show Coordinates"
              checked={settings.showCoordinates}
              onChange={(v) => updateSettings({ showCoordinates: v })}
            />
          </SettingRow>

          <SettingRow
            icon={Crosshair}
            label="Highlight Legal Moves"
            desc="Show dots on squares where pieces can move"
          >
            <Toggle
              label="Highlight Legal Moves"
              checked={settings.highlightMoves}
              onChange={(v) => updateSettings({ highlightMoves: v })}
            />
          </SettingRow>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-title">
                <Palette className="setting-icon" size={16} />
                <span>Board Theme</span>
              </div>
              <span className="setting-desc">Choose your board color scheme</span>
            </div>
            <div className="theme-selector">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-option ${settings.boardTheme === theme.id ? 'active' : ''}`}
                  aria-pressed={settings.boardTheme === theme.id}
                  onClick={() => updateSettings({ boardTheme: theme.id })}
                  title={theme.name}
                  type="button"
                >
                  <div className="theme-preview">
                    <div className="theme-square light" style={{ backgroundColor: theme.light }} />
                    <div className="theme-square dark" style={{ backgroundColor: theme.dark }} />
                  </div>
                  <span className="theme-name">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={Settings2} title="Gameplay">
          <SettingRow
            icon={Crown}
            label="Auto-Promote to Queen"
            desc="Automatically promote pawns to queen"
          >
            <Toggle label="Auto-Promote to Queen" checked={settings.autoQueen} onChange={(v) => updateSettings({ autoQueen: v })} />
          </SettingRow>

          <SettingRow
            icon={MousePointer2}
            label="Confirm Moves"
            desc="Require confirmation before making a move"
          >
            <Toggle
              label="Confirm Moves"
              checked={settings.confirmMoves}
              onChange={(v) => updateSettings({ confirmMoves: v })}
            />
          </SettingRow>

          <SettingRow
            icon={Settings2}
            label="Show Hints Button"
            desc="Display the hint button during games"
          >
            <Toggle label="Show Hints Button" checked={settings.showHints} onChange={(v) => updateSettings({ showHints: v })} />
          </SettingRow>
        </Section>

        <Section icon={Volume2} title="Sound">
          <SettingRow
            icon={Volume2}
            label="Sound Effects"
            desc="Play sounds for moves and game events"
          >
            <Toggle
              label="Sound Effects"
              checked={settings.soundEnabled}
              onChange={(v) => updateSettings({ soundEnabled: v })}
            />
          </SettingRow>

          {settings.soundEnabled && (
            <div className="setting-item setting-item-vertical">
              <div className="setting-info">
                <div className="setting-title">
                  <Volume2 className="setting-icon" size={16} />
                  <span>Volume</span>
                  <span className="volume-value">{settings.soundVolume}%</span>
                </div>
                <span className="setting-desc">Adjust the sound effect loudness</span>
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
        </Section>

        <Section icon={Smartphone} title="Haptics">
          <SettingRow
            icon={Smartphone}
            label="Haptic Feedback"
            desc="Vibrate on moves and captures (mobile only)"
          >
            <Toggle
              checked={settings.hapticEnabled}
              onChange={(v) => updateSettings({ hapticEnabled: v })}
            />
          </SettingRow>
        </Section>

        <Section icon={Bug} title="Advanced">
          <SettingRow icon={Bug} label="Debug Mode" desc="Show AI thinking and evaluation data">
            <Toggle label="Debug Mode" checked={settings.debugMode} onChange={(v) => updateSettings({ debugMode: v })} />
          </SettingRow>
        </Section>

        <Section icon={ScrollText} title="About">
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-title">
                <ScrollText className="setting-icon" size={16} />
                <span>Changelog</span>
              </div>
              <span className="setting-desc">See recent updates and fixes</span>
            </div>
            <button className="link-button" type="button" onClick={() => navigate('/changelog')}>
              View
            </button>
          </div>
        </Section>

        <Section icon={ShieldCheck} title="Terms & Privacy">
          <div className="legal-settings-block" id="terms">
            <div className="legal-settings-heading">
              <h3>Terms of Service</h3>
              <span>Last updated: July 2026</span>
            </div>
            {TERMS_SECTIONS.map(([title, text], index) => (
              <article className="legal-settings-section" key={title}>
                <h4>{index + 1}. {title}</h4>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <div className="legal-settings-block" id="privacy">
            <div className="legal-settings-heading">
              <h3>Privacy Policy</h3>
              <span>Last updated: July 2026</span>
            </div>
            {PRIVACY_SECTIONS.map(([title, text], index) => (
              <article className="legal-settings-section" key={title}>
                <h4>{index + 1}. {title}</h4>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </Section>

        {user && (
          <Section icon={User2} title="Account">
            <div className="account-info">
              <div className="account-row">
                <span className="account-label">Username</span>
                <span className="account-value">{user.username}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Rated Rating</span>
                <span className="account-value account-value-elo">{user.elo}</span>
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
            <button className="logout-btn" onClick={logout} type="button">
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </Section>
        )}

        <div className="settings-actions">
          <button className="reset-btn" onClick={resetSettings} type="button">
            <RotateCcw size={15} />
            <span>Reset to Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
}
