import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import LoginModal from './LoginModal';
import './UserBadge.css';

export default function UserBadge() {
  const { user, isLoggedIn, logout, isOnline } = useUser();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isLoggedIn) {
    return (
      <>
        <button 
          className="login-btn"
          onClick={() => setShowLoginModal(true)}
        >
          Sign In
        </button>
        {showLoginModal && (
          <LoginModal onClose={() => setShowLoginModal(false)} />
        )}
      </>
    );
  }

  const winRate = user.gamesPlayed > 0 
    ? Math.round((user.wins / user.gamesPlayed) * 100) 
    : 0;

  return (
    <div className="user-badge-container">
      <button 
        className="user-badge"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <span className="user-avatar">👤</span>
        <span className="user-name">{user.username}</span>
        <span className="user-elo">{user.elo}</span>
        <span className="db-indicator" title={isOnline ? "Online" : "Offline"}>{isOnline ? '☁️' : '📴'}</span>
      </button>

      {showDropdown && (
        <>
          <div 
            className="dropdown-backdrop" 
            onClick={() => setShowDropdown(false)}
          />
          <div className="user-dropdown">
            <div className="dropdown-header">
              <span className="dropdown-username">{user.username}</span>
              <span className="dropdown-elo">
                <span className="elo-label">Rating:</span>
                <span className="elo-value">{user.elo}</span>
              </span>
            </div>
            <div className="dropdown-divider" />
            <div className="dropdown-stats">
              <div className="stat-row">
                <span className="stat-label">Games</span>
                <span className="stat-value">{user.gamesPlayed || 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">W / L / D</span>
                <span className="stat-value">
                  <span className="win">{user.wins || 0}</span>
                  {' / '}
                  <span className="loss">{user.losses || 0}</span>
                  {' / '}
                  <span className="draw">{user.draws || 0}</span>
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Win Rate</span>
                <span className="stat-value">{winRate}%</span>
              </div>
            </div>
            <div className="dropdown-divider" />
            <div className="dropdown-sync-status">
              <span className={isOnline ? "sync-online" : "sync-offline"}>
                {isOnline ? '☁️ Connected' : '📴 Offline'}
              </span>
            </div>
            <div className="dropdown-divider" />
            <button 
              className="dropdown-item logout"
              onClick={() => {
                logout();
                setShowDropdown(false);
              }}
            >
              🚪 Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
