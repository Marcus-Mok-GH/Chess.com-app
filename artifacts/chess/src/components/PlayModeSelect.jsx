import { Bot, Globe2 } from 'lucide-react';

import './PlayModeSelect.css';
import { useT } from '../i18n/I18nContext';

/**
 * Entry screen for the Play tab: offers the two ways to play — Bots (local
 * games against the computer) and Online (the `/online` lobby).
 *
 * @param {object} props
 * @param {() => void} props.onSelectBots - Continue to the bot setup screen.
 * @param {() => void} props.onSelectOnline - Navigate to the online lobby.
 * @param {boolean} [props.onlineDisabled] - Disable the Online option while
 *   the device is offline (shows an "Offline" badge instead).
 */
export default function PlayModeSelect({
  onSelectBots,
  onSelectOnline,
  onlineDisabled = false,
}) {
  const t = useT();
  return (
    <div className="play-mode-select">
      <div className="play-mode-card">
        <div>
          <h2 className="play-mode-title">{t("Play Chess")}</h2>
          <p className="play-mode-subtitle">{t("Choose how you want to play.")}</p>
        </div>

        <div className="play-mode-options">
          <button
            type="button"
            className="play-mode-option"
            onClick={onSelectBots}
          >
            <span className="play-mode-icon" aria-hidden="true">
              <Bot size={28} />
            </span>
            <span className="play-mode-name">{t("Bots")}</span>
            <span className="play-mode-desc">{t("Play against the computer")}</span>
          </button>

          <button
            type="button"
            className="play-mode-option"
            onClick={onSelectOnline}
            disabled={onlineDisabled}
          >
            <span className="play-mode-icon" aria-hidden="true">
              <Globe2 size={28} />
            </span>
            <span className="play-mode-name">{t("Online")}</span>
            <span className="play-mode-desc">
              {onlineDisabled
                ? t('Connect to play online')
                : t('Play against other players live')}
            </span>
            {onlineDisabled && (
              <span className="play-mode-badge">{t("Offline")}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
