import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon">
          <AlertCircle size={56} />
        </div>
        <h1 className="not-found-code">404</h1>
        <h2 className="not-found-title">Lost Position</h2>
        <p className="not-found-desc">
          The page you're looking for doesn't exist, has been moved, or is off the board.
        </p>
        <button
          className="not-found-btn"
          onClick={() => navigate('/')}
          type="button"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}
