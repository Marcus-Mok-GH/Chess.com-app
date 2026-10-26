import { useT } from '../i18n/I18nContext';
export default function Settings({ settings, onUpdateSettings, onClose }) {
  const t = useT();
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t("Settings")}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="settings-content">
          <div className="settings-section">
            <h3>{t("Debug")}</h3>
            <label className="setting-row">
              <span>{t("Show AI Thinking")}</span>
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(e) => onUpdateSettings({ ...settings, debugMode: e.target.checked })}
              />
            </label>
            <p className="setting-desc">{t("Shows what moves the AI is considering and their evaluations")}</p>
          </div>

          <div className="settings-section">
            <h3>{t("Display")}</h3>
            <label className="setting-row">
              <span>{t("Show Coordinates")}</span>
              <input
                type="checkbox"
                checked={settings.showCoordinates}
                onChange={(e) => onUpdateSettings({ ...settings, showCoordinates: e.target.checked })}
              />
            </label>
            <label className="setting-row">
              <span>{t("Highlight Moves")}</span>
              <input
                type="checkbox"
                checked={settings.highlightMoves}
                onChange={(e) => onUpdateSettings({ ...settings, highlightMoves: e.target.checked })}
              />
            </label>
          </div>

          <div className="settings-section">
            <h3>{t("Gameplay")}</h3>
            <label className="setting-row">
              <span>{t("Auto-Promote to Queen")}</span>
              <input
                type="checkbox"
                checked={settings.autoQueen}
                onChange={(e) => onUpdateSettings({ ...settings, autoQueen: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
