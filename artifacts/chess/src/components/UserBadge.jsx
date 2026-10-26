import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import LoginModal from './LoginModal';
import './UserBadge.css';
import { useT } from '../i18n/I18nContext';

export default function UserBadge() {
  const t = useT();
  const { user, isLoggedIn, logout, isOnline } = useUser();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!showDropdown) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDropdown]);

  if (!isLoggedIn) {
    return (
      <>
        <button 
          className="login-btn"
          aria-label={t("Sign in to your account")}
          onClick={() => setShowLoginModal(true)}
        >
          {t("Sign In")}</button>
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
        aria-expanded={showDropdown}
        aria-haspopup="true"
        aria-label={t("User profile and menu")}
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <span className="user-avatar" aria-hidden="true">👤</span>
        <span className="user-name">{user.username}</span>
        <span className="user-elo">{user.elo}</span>
        <span className="db-indicator" title={t(isOnline ? "Online" : "Offline")}>{isOnline ? '●' : '○'}</span>
      </button>

      {showDropdown && (
        <>
          <div 
            className="dropdown-backdrop" 
            onClick={() => setShowDropdown(false)}
          />
          <div className="user-dropdown" role="menu" aria-label={t("User menu")}>
            <div className="dropdown-header">
              <span className="dropdown-username">{user.username}</span>
              <span className="dropdown-elo">
                <span className="elo-label">{t("Unlimited:")}</span>
                <span className="elo-value">{user.elo}</span>
              </span>
              <span className="dropdown-elo">
                <span className="elo-label">{t("Bullet:")}</span>
                <span className="elo-value">{user.bulletElo ?? user.elo}</span>
              </span>
              <span className="dropdown-elo">
                <span className="elo-label">{t("Blitz:")}</span>
                <span className="elo-value">{user.blitzElo ?? user.elo}</span>
              </span>
              <span className="dropdown-elo">
                <span className="elo-label">{t("Rapid:")}</span>
                <span className="elo-value">{user.rapidElo ?? user.elo}</span>
              </span>
              <span className="dropdown-elo">
                <span className="elo-label">{t("Classical:")}</span>
                <span className="elo-value">
                  {user.classicalElo ?? user.elo}
                </span>
              </span>
            </div>
            <div className="dropdown-divider" role="separator" />
            <div className="dropdown-stats">
              <div className="stat-row">
                <span className="stat-label">{t("Rated Games")}</span>
                <span className="stat-value">{user.gamesPlayed || 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t("Rated W / L / D")}</span>
                <span className="stat-value">
                  <span className="win">{user.wins || 0}</span>
                  {' / '}
                  <span className="loss">{user.losses || 0}</span>
                  {' / '}
                  <span className="draw">{user.draws || 0}</span>
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t("Rated Win Rate")}</span>
                <span className="stat-value">{winRate}%</span>
              </div>
            </div>
            <div className="dropdown-divider" role="separator" />
            <button 
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setShowDropdown(false);
                window.location.href = '/history';
              }}
            >
              {t("View Stats & Charts")}</button>
            <div className="dropdown-divider" role="separator" />
            <div className="dropdown-sync-status">
              <span className={isOnline ? "sync-online" : "sync-offline"}>
                {t(isOnline ? 'Connected' : 'Offline')}
              </span>
            </div>
            <div className="dropdown-divider" role="separator" />
            <button 
              className="dropdown-item logout"
              role="menuitem"
              onClick={() => {
                logout();
                setShowDropdown(false);
              }}
            >
              {t("Sign Out")}</button>
          </div>
        </>
      )}
    </div>
  );
}
