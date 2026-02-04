import { BOTS } from '../utils/bots';
import EloSlider from './EloSlider';

const REGULAR_BOTS = BOTS.filter((b) => b.id !== 'coach');
const COACH_BOT = BOTS.find((b) => b.id === 'coach');

function BotCard({ bot, selected, onSelect, disabled, customElo }) {
  return (
    <button
      type="button"
      className={`bot-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(bot)}
      disabled={disabled}
      style={{ '--bot-color': bot.color }}
    >
      <div className="bot-avatar">{bot.avatar}</div>
      <div className="bot-info">
        <span className="bot-name">{bot.name}</span>
        <span className="bot-rating">
          {bot.id === 'custom' ? customElo : `Rating: ${bot.rating}`}
        </span>
      </div>
      <div className="bot-personality">{bot.personality}</div>
    </button>
  );
}

export default function BotSelector({ selectedBot, onSelectBot, disabled, customElo, onCustomEloChange }) {
  return (
    <div className="bot-selector">
      <label className="bot-selector-label">Choose your opponent:</label>
      <div className="bot-grid">
        {REGULAR_BOTS.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            selected={selectedBot.id === bot.id}
            onSelect={onSelectBot}
            disabled={disabled}
            customElo={customElo}
          />
        ))}
      </div>
      {COACH_BOT && (
        <div className="bot-special-section">
          <span className="bot-special-label">Special</span>
          <div className="bot-special-grid">
            <BotCard
              bot={COACH_BOT}
              selected={selectedBot.id === COACH_BOT.id}
              onSelect={onSelectBot}
              disabled={disabled}
              customElo={customElo}
            />
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
