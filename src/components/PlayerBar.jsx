import ChessPieceIcon from './ChessPieceIcon';

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
  isCoach = false
}) {
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const safeCapturedPieces = Array.isArray(capturedPieces) ? capturedPieces : [];
  const materialDiff = safeCapturedPieces.reduce((sum, p) => sum + (pieceValues[p] || 0), 0);
  const capturedColor = color === 'w' ? 'b' : 'w';

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
          <span className={`bot-quote ${isCoach ? 'coach-quote' : ''}`}>"{botMessage}"</span>
        </div>
      )}
      <div className="captured-pieces">
        {safeCapturedPieces.map((piece, i) => (
          <span key={i} className="captured-piece">
            <ChessPieceIcon piece={piece} color={capturedColor} size={16} />
          </span>
        ))}
        {materialDiff > 0 && <span className="material-diff">+{materialDiff}</span>}
      </div>
    </div>
  );
}
