import "./CoachingTip.css";
import { useT } from '../i18n/I18nContext';

export default function CoachingTip({ tip, isLoading, onDismiss }) {
  const t = useT();
  if (!tip && !isLoading) return null;

  return (
    <div className="coaching-tip">
      <div className="coaching-tip-header">
        <span className="coaching-tip-icon">🎓</span>
        <span className="coaching-tip-title">{t("Coach's Feedback")}</span>
        {tip && (
          <button
            type="button"
            className="coaching-tip-dismiss"
            onClick={onDismiss}
            aria-label={t("Dismiss coach feedback")}
            title={t("Dismiss coach feedback")}
          >
            ×
          </button>
        )}
      </div>
      <div className="coaching-tip-content">
        {isLoading ? (
          <div className="coaching-tip-loading">
            <span className="coaching-spinner"></span>
            {t("Analyzing your move...")}</div>
        ) : (
          <p>{tip}</p>
        )}
      </div>
    </div>
  );
}
