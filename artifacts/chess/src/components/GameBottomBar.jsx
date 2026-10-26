import './GameBottomBar.css';
import haptics from "../utils/haptics";
import { useT } from '../i18n/I18nContext';

export default function GameBottomBar({
  onNew,
  onFlipBoard,
  onUndo,
  onHint,
  onResign,
  canUndo,
  isThinking,
  showHints = true,
  botMessage,
  selectedBot,
}) {
  const t = useT();
  return (
    <div className="game-bottom-bar" role="navigation" aria-label={t("Game controls")}>
      {botMessage && selectedBot && (
        <div className="gbb-bot-message">
          <span className="gbb-bot-avatar" style={{ background: selectedBot.color }}>{selectedBot.avatar}</span>
          <div className="gbb-bot-text">
            <span className="gbb-bot-name">{t(selectedBot.name)}</span>
            <span className="gbb-bot-quote">"{t(botMessage)}"</span>
          </div>
        </div>
      )}
      <div className="gbb-actions">
        <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onNew(); }}>
          {t("New")}</button>
        <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onUndo(); }} disabled={!canUndo || isThinking}>
          {t("Undo")}</button>
        <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onFlipBoard(); }}>
          {t("Flip")}</button>
        {showHints && (
          <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onHint(); }} disabled={isThinking}>
            {t("Hint")}</button>
        )}
        <button type="button" className="gbb-btn danger" onClick={() => { haptics.button(); onResign(); }} disabled={isThinking}>
          {t("Resign")}</button>
      </div>
    </div>
  );
}
