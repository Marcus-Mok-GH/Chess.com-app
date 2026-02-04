import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './GuestBlocked.css';

export default function GuestBlocked({ targetPage = 'Online Play', reason = 'Online play requires authentication' }) {
  const navigate = useNavigate();
  const { logout } = useUser();

  return (
    <div className="guest-blocked-container">
      <div className="guest-blocked-content">
        <div className="guest-blocked-icon">🔒</div>
        <h2 className="guest-blocked-title">Guest Access Restricted</h2>
        <p className="guest-blocked-description">
          {reason}
        </p>
        <div className="guest-blocked-target">
          <span className="target-label">Target:</span>
          <span className="target-page">{targetPage}</span>
        </div>
        <div className="guest-blocked-actions">
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Sign In
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/play')}>
            Play Offline
          </button>
        </div>
      </div>
    </div>
  );
}
