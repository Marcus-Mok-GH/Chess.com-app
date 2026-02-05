import ChessPieceIcon from './ChessPieceIcon';
import './PromotionDialog.css';

const PROMOTION_OPTIONS = [
  { id: 'q', label: 'Queen', piece: 'Q' },
  { id: 'r', label: 'Rook', piece: 'R' },
  { id: 'b', label: 'Bishop', piece: 'B' },
  { id: 'n', label: 'Knight', piece: 'N' },
];

export default function PromotionDialog({ open, color = 'w', onSelect, onCancel }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal promotion-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Choose Promotion</div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className="promotion-dialog-body">
          <p>Select the piece to promote your pawn:</p>
          <div className="promotion-options">
            {PROMOTION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="promotion-option"
                onClick={() => onSelect(option.id)}
              >
                <ChessPieceIcon piece={option.piece} color={color} size={22} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="promotion-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
