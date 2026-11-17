import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n/I18nContext';
import './AccountRequired.css';
import './PuzzleLimitNotice.css';

/**
 * Paywall shown in place of the board once a free player has used their three
 * puzzles for the day.
 *
 * @param {object} props
 * @param {{used?: number, limit?: number|null, resetsAt?: string}} [props.usage]
 * @returns {JSX.Element}
 */
export default function PuzzleLimitNotice({ usage }) {
  const t = useT();
  const navigate = useNavigate();

  const limit = Number(usage?.limit) || 3;
  const resetTime = usage?.resetsAt ? new Date(usage.resetsAt) : null;
  const resetLabel =
    resetTime && !Number.isNaN(resetTime.getTime())
      ? resetTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <section className="account-required puzzle-limit" aria-labelledby="puzzle-limit-title">
      <div className="account-required-card card-surface">
        <span className="account-required-icon" aria-hidden="true">
          <Lock size={26} />
        </span>
        <h2 id="puzzle-limit-title">{t("That's all three puzzles for today")}</h2>
        <p>
          {resetLabel
            ? t("Your free puzzles are used up. They come back at {time} — or go unlimited with a subscription.", { time: resetLabel })
            : t("Your free puzzles are used up. They come back tomorrow — or go unlimited with a subscription.")}
        </p>
        <div className="account-required-actions">
          <button
            type="button"
            className="account-required-primary"
            onClick={() => navigate('/subscription')}
          >
            <Sparkles size={15} /> {t("See unlimited")}
          </button>
          <button
            type="button"
            className="account-required-secondary"
            onClick={() => navigate('/home')}
          >
            {t("Back to home")}
          </button>
        </div>
        <p className="puzzle-limit-count">
          {t("{used} of {limit} free puzzles used today", { used: Number(usage?.used) || limit, limit })}
        </p>
      </div>
    </section>
  );
}
