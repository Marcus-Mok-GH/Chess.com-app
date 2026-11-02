import { Link } from 'react-router-dom';

import { BOTS, canAccessBot, getBotRatingDisplay } from '../engine/bots/bots';
import './BotSelector.css';
import EloSlider from './EloSlider';
import { useT } from '../i18n/I18nContext';

const REGULAR_BOTS = BOTS.filter((b) => b.id !== 'coach');
const COACH_BOT = BOTS.find((b) => b.id === 'coach');
const HAS_PREMIUM_BOTS = REGULAR_BOTS.some((b) => b.requiresSubscription);

function BotCard({ bot, selected, onSelect, disabled, customElo, locked }) {
  const t = useT();
  return (
    <button
      type="button"
      className={`bot-card ${selected ? 'selected' : ''} ${locked ? 'bot-card-locked' : ''}`}
      onClick={() => onSelect(bot)}
      disabled={disabled}
      style={{ '--bot-color': bot.color }}
      title={locked ? t('Upgrade to unlock Rex and Nadia') : undefined}
    >
      <div className="bot-avatar">{bot.avatar}</div>
      <div className="bot-info">
        <span className="bot-name">
          {t(bot.name)}
          {bot.requiresSubscription && (
            <span className="bot-premium-badge">{t('Premium')}</span>
          )}
        </span>
        <span className="bot-rating">
          {bot.id === 'custom' ? customElo : t('Rating: {rating}', { rating: getBotRatingDisplay(bot) })}
        </span>
      </div>
      <div className="bot-personality">{t(bot.personality)}</div>
    </button>
  );
}

export default function BotSelector({
  selectedBot,
  onSelectBot,
  disabled,
  customElo,
  onCustomEloChange,
  isLoggedIn,
  hasSubscription = false,
}) {
  const t = useT();
  const premiumLocked = !hasSubscription;

  return (
    <div className="bot-selector">
      <label className="bot-selector-label">{t('Choose your opponent:')}</label>
      <div className="bot-grid">
        {REGULAR_BOTS.map((bot) => {
          const locked = !canAccessBot(bot, hasSubscription);
          return (
            <BotCard
              key={bot.id}
              bot={bot}
              selected={selectedBot.id === bot.id}
              onSelect={onSelectBot}
              disabled={disabled || locked}
              locked={locked}
              customElo={customElo}
            />
          );
        })}
      </div>
      {HAS_PREMIUM_BOTS && premiumLocked && (
        <div className="bot-premium-hint">
          <span>{t('Upgrade to unlock Rex and Nadia')}</span>
          <Link to="/subscription" className="bot-premium-hint-link">
            {t('Manage subscription')}
          </Link>
        </div>
      )}
      {COACH_BOT && (
        <div className="bot-special-section">
          <span className="bot-special-label">{t('Special')}</span>
          <div className="bot-special-grid">
            <BotCard
              bot={COACH_BOT}
              selected={selectedBot.id === COACH_BOT.id}
              onSelect={onSelectBot}
              disabled={disabled || !isLoggedIn}
              customElo={customElo}
            />
            {!isLoggedIn && (
              <div className="coach-login-hint">{t('Sign in to unlock the AI Coach')}</div>
            )}
          </div>
        </div>
      )}
      {selectedBot.id === 'custom' && (
        <EloSlider
          value={customElo}
          onChange={onCustomEloChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
