import './CoachingTip.css';

export default function CoachingTip({ tip, isLoading, onDismiss }) {
  if (!tip && !isLoading) return null;

  return (
    <div className="coaching-tip">
      <div className="coaching-tip-header">
        <span className="coaching-tip-icon">🎓</span>
        <span className="coaching-tip-title">Coach's Feedback</span>
        {tip && !isLoading && (
          <button className="coaching-tip-dismiss" onClick={onDismiss}>
            ×
          </button>
        )}
      </div>
      <div className="coaching-tip-content">
        {isLoading && !tip ? (
          <div className="coaching-tip-loading">
            <span className="coaching-spinner"></span>
            Analyzing your move...
          </div>
        ) : (
          <p className="coaching-tip-text">{tip}</p>
        )}
      </div>
    </div>
  );
}
