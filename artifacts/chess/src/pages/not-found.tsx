import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

export default function NotFound() {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon">
          <AlertCircle size={56} />
        </div>
        <h1 className="not-found-code">404</h1>
        <h2 className="not-found-title">{t("Lost Position")}</h2>
        <p className="not-found-desc">
          {t("The page you're looking for doesn't exist, has been moved, or is off the board.")}</p>
        <button
          className="not-found-btn"
          onClick={() => navigate('/')}
          type="button"
        >
          {t("Return to Home")}</button>
      </div>
    </div>
  );
}
