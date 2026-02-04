import { useState, useEffect, useRef } from 'react';
import './FeedbackPanel.css';

const REAPPEAR_DELAY = 30000; // 30 seconds

export function FeedbackPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [feedbackType, setFeedbackType] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const reappearTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (reappearTimerRef.current) {
        clearTimeout(reappearTimerRef.current);
      }
    };
  }, []);

  const handleDismiss = (e) => {
    e.stopPropagation();
    setIsHidden(true);
    
    if (reappearTimerRef.current) {
      clearTimeout(reappearTimerRef.current);
    }
    
    reappearTimerRef.current = setTimeout(() => {
      setIsHidden(false);
    }, REAPPEAR_DELAY);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    
    // Simulate submission (replace with actual API call)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Feedback submitted:', { feedbackType, message, email });
    
    setIsSubmitting(false);
    setSubmitted(true);
    
    setTimeout(() => {
      setIsOpen(false);
      setSubmitted(false);
      setMessage('');
      setEmail('');
      setFeedbackType('suggestion');
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (isHidden) {
    return null;
  }

  return (
    <>
      <div className="feedback-trigger-wrapper">
        <button
          className="feedback-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Send feedback"
        >
          💬 Feedback
        </button>
        <button
          className="feedback-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss feedback button"
        >
          ✕
        </button>
      </div>

      {isOpen && (
        <div className="feedback-overlay" onKeyDown={handleKeyDown}>
          <div className="feedback-modal">
            <button
              className="feedback-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close feedback"
            >
              ✕
            </button>

            {submitted ? (
              <div className="feedback-success">
                <span className="success-icon">✓</span>
                <h3>Thank you!</h3>
                <p>Your feedback has been submitted.</p>
              </div>
            ) : (
              <>
                <div className="feedback-header">
                  <h2>Send Feedback</h2>
                  <p>Help us improve your chess experience</p>
                </div>

                <form onSubmit={handleSubmit} className="feedback-form">
                  <div className="feedback-types">
                    {[
                      { id: 'suggestion', label: '💡 Suggestion', value: 'suggestion' },
                      { id: 'bug', label: '🐛 Bug Report', value: 'bug' },
                      { id: 'praise', label: '❤️ Praise', value: 'praise' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        className={`type-btn ${feedbackType === type.value ? 'active' : ''}`}
                        onClick={() => setFeedbackType(type.value)}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  <div className="input-group">
                    <label htmlFor="feedback-message">Your feedback</label>
                    <textarea
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        feedbackType === 'bug'
                          ? 'Describe the bug and steps to reproduce...'
                          : feedbackType === 'praise'
                          ? 'What do you love about the app?'
                          : 'Share your ideas for improvement...'
                      }
                      rows={4}
                      autoFocus
                      maxLength={1000}
                    />
                    <span className="char-count">{message.length}/1000</span>
                  </div>

                  <div className="input-group">
                    <label htmlFor="feedback-email">Email (optional)</label>
                    <input
                      id="feedback-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                    />
                    <span className="input-hint">We'll only use this to follow up on your feedback</span>
                  </div>

                  <div className="feedback-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setIsOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmitting || !message.trim()}
                    >
                      {isSubmitting ? 'Sending...' : 'Send Feedback'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
