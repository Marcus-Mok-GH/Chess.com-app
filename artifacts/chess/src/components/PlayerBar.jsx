import ChessPieceIcon from './ChessPieceIcon';
import { formatClock, isLowTime } from '../utils/timeControls';
import { useT } from '../i18n/I18nContext';

export default function PlayerBar({ 
  name, 
  avatar, 
  rating, 
  isBot, 
  isActive, 
  capturedPieces,
  color,
  botColor,
  botMessage,
  isCoach = false,
  clockMs = null,
  clockActive = false,
}) {
  const t = useT();
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const materialDiff = capturedPieces.reduce((sum, p) => sum + (pieceValues[p] || 0), 0);
  const capturedColor = color === 'w' ? 'b' : 'w';
  const showClock = clockMs != null;

  return (
    <div className={`player-bar ${isActive ? 'active' : ''}`}>
      <div className="player-avatar" style={isBot ? { background: botColor } : {}}>
        {avatar}
      </div>
      <div className="player-details">
        <span className="player-name">{name}</span>
        <span className="player-rating">({rating})</span>
      </div>
      {isBot && botMessage && (
        <div className={`bot-message-inline ${isCoach ? 'coach-message' : ''}`}>
          <span className={`bot-quote ${isCoach ? 'coach-quote' : ''}`}>"{t(botMessage)}"</span>
        </div>
      )}
      {showClock && (
        <div
          className={`player-clock ${clockActive ? 'active' : ''} ${isLowTime(clockMs) ? 'low' : ''}`}
          aria-label={t('{name} clock {time}', { name: t(name), time: formatClock(clockMs) })}
        >
          {formatClock(clockMs)}
        </div>
      )}
      <div className="captured-pieces">
        {capturedPieces.map((piece, i) => (
          <span key={i} className="captured-piece">
            <ChessPieceIcon piece={piece} color={capturedColor} size={16} />
          </span>
        ))}
        {materialDiff > 0 && <span className="material-diff">+{materialDiff}</span>}
      </div>
    </div>
  );
}
