import { ArrowLeft } from 'lucide-react';

import BotSelector from './BotSelector';

import './PlaySetup.css';
import { useT } from '../i18n/I18nContext';

export default function PlaySetup({
  selectedBot,
  onSelectBot,
  customElo,
  onCustomEloChange,
  playerColor,
  onSelectColor,
  onStart,
  onBack,
  isLoggedIn,
}) {
  const t = useT();
  const canStart = Boolean(selectedBot) && Boolean(playerColor);

  return (
    <div className="play-setup">
      <div className="play-setup-card">
        {onBack && (
          <button
            type="button"
            className="play-setup-back"
            onClick={onBack}
          >
            <ArrowLeft size={15} aria-hidden="true" /> {' '}{t("Back")}</button>
        )}
        <div>
          <h2 className="play-setup-title">{t("Play Chess")}</h2>
          <p className="play-setup-subtitle">{t("Choose your opponent and color to start a game.")}</p>
        </div>

        <div className="play-setup-section">
          <h3 className="play-setup-label">{t("Opponent")}</h3>
          <BotSelector
            selectedBot={selectedBot}
            onSelectBot={onSelectBot}
            disabled={false}
            customElo={customElo}
            onCustomEloChange={onCustomEloChange}
            isLoggedIn={isLoggedIn}
          />
        </div>

        <div className="play-setup-section">
          <h3 className="play-setup-label">{t("Color")}</h3>
          <div className="color-choice">
            <button
              type="button"
              className={`color-btn ${playerColor === 'w' ? 'selected' : ''}`}
              onClick={() => onSelectColor('w')}
              aria-pressed={playerColor === 'w'}
            >
              <span className="color-btn-emoji" aria-hidden="true">♔</span>
              {t("White")}</button>
            <button
              type="button"
              className={`color-btn ${playerColor === 'b' ? 'selected' : ''}`}
              onClick={() => onSelectColor('b')}
              aria-pressed={playerColor === 'b'}
            >
              <span className="color-btn-emoji" aria-hidden="true">♚</span>
              {t("Black")}</button>
            <button
              type="button"
              className={`color-btn color-btn-random ${playerColor === 'random' ? 'selected' : ''}`}
              onClick={() => onSelectColor('random')}
              aria-pressed={playerColor === 'random'}
            >
              <span className="color-btn-emoji" aria-hidden="true">🎲</span>
              {t("Random")}</button>
          </div>
        </div>

        <div className="play-setup-actions">
          <button
            type="button"
            className="start-btn"
            onClick={onStart}
            disabled={!canStart}
          >
            {t("Start Game")}</button>
        </div>
      </div>
    </div>
  );
}
