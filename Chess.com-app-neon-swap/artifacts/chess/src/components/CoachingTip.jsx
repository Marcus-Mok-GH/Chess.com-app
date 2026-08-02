import './CoachingTip.css';

export default function CoachingTip({ tip, isLoading, onDismiss }) {
  if (!tip && !isLoading) return null;

  return (
    <div className="coaching-tip">
      <div className="coaching-tip-header">
        <span className="coaching-tip-icon">🎓</span>
        <span className="coaching-tip-title">Coach's Feedback</span>
        {tip && (
          <button className="coaching-tip-dismiss" onClick={onDismiss}>
            ×
          </button>
        )}
      </div>
      <div className="coaching-tip-content">
        {isLoading ? (
          <div className="coaching-tip-loading">
            <span className="coaching-spinner"></span>
            Analyzing your move...
          </div>
        ) : (
          <p>{tip}</p>
        )}
      </div>
    </div>
  );
}
