import './AIDialogueDrawer.css';

export default function AIDialogueDrawer({
  message,
  isOpen,
  onToggle,
  onClose,
  isLoading,
  title,
  avatar,
}) {
  const hasContent = Boolean(message || isLoading);

  if (!hasContent) return null;

  return (
    <div className={`ai-dialogue-drawer ${isOpen ? 'open' : 'closed'}`}>
      <div className="ai-dialogue-header">
        <button type="button" className="ai-dialogue-toggle" onClick={onToggle}>
          <span className="ai-dialogue-handle" />
          <span className="ai-dialogue-title">
            <span className="ai-dialogue-avatar" aria-hidden="true">{avatar}</span>
            {title}
          </span>
        </button>
        <button type="button" className="ai-dialogue-close" onClick={onClose} aria-label="Close dialogue">
          ×
        </button>
      </div>
      <div className="ai-dialogue-body">
        {isLoading ? (
          <div className="ai-dialogue-loading">
            <span className="ai-dialogue-spinner" aria-hidden="true" />
            Analyzing...
          </div>
        ) : (
          <p>{message}</p>
        )}
      </div>
    </div>
  );
}
