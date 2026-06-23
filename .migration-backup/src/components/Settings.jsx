export default function Settings({ settings, onUpdateSettings, onClose }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="settings-content">
          <div className="settings-section">
            <h3>Debug</h3>
            <label className="setting-row">
              <span>Show AI Thinking</span>
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(e) => onUpdateSettings({ ...settings, debugMode: e.target.checked })}
              />
            </label>
            <p className="setting-desc">Shows what moves the AI is considering and their evaluations</p>
          </div>

          <div className="settings-section">
            <h3>Display</h3>
            <label className="setting-row">
              <span>Show Coordinates</span>
              <input
                type="checkbox"
                checked={settings.showCoordinates}
                onChange={(e) => onUpdateSettings({ ...settings, showCoordinates: e.target.checked })}
              />
            </label>
            <label className="setting-row">
              <span>Highlight Moves</span>
              <input
                type="checkbox"
                checked={settings.highlightMoves}
                onChange={(e) => onUpdateSettings({ ...settings, highlightMoves: e.target.checked })}
              />
            </label>
          </div>

          <div className="settings-section">
            <h3>Gameplay</h3>
            <label className="setting-row">
              <span>Auto-Promote to Queen</span>
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
