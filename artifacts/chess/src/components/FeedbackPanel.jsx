import { useState, useEffect, useRef } from 'react';
import './FeedbackPanel.css';
import { useT } from '../i18n/I18nContext';

const REAPPEAR_DELAY = 30000; // 30 seconds

export function FeedbackPanel() {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [feedbackType, setFeedbackType] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
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
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          message: trimmedMessage,
          email: email.trim() || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error?.message || 'Unable to send feedback');
      }

      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage('');
        setEmail('');
        setFeedbackType('suggestion');
        setSubmitError('');
      }, 2000);
    } catch (error) {
      console.error('Feedback submission failed:', error);
      setSubmitError(error instanceof Error && error.message ? error.message : "We couldn't send your feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
          onClick={() => { setSubmitError(''); setIsOpen(true); }}
          aria-label={t("Send feedback")}
        >
          {t("Feedback")}</button>
        <button
          className="feedback-dismiss"
          onClick={handleDismiss}
          aria-label={t("Dismiss feedback button")}
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
              aria-label={t("Close feedback")}
            >
              ✕
            </button>

            {submitted ? (
              <div className="feedback-success">
                <span className="success-icon">✓</span>
                <h3>{t("Thank you!")}</h3>
                <p>{t("Your feedback has been submitted.")}</p>
              </div>
            ) : (
              <>
                <div className="feedback-header">
                  <h2>{t("Send Feedback")}</h2>
                  <p>{t("Help us improve your chess experience")}</p>
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
                        {t(type.label)}
                      </button>
                    ))}
                  </div>

                  <div className="input-group">
                    <label htmlFor="feedback-message">{t("Your feedback")}</label>
                    <textarea
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        feedbackType === 'bug'
                          ? t('Describe the bug and steps to reproduce...')
                          : feedbackType === 'praise'
                          ? t('What do you love about the app?')
                          : t('Share your ideas for improvement...')
                      }
                      rows={4}
                      autoFocus
                      maxLength={1000}
                    />
                    <span className="char-count">{message.length}/1000</span>
                  </div>

                  <div className="input-group">
                    <label htmlFor="feedback-email">{t("Email (optional)")}</label>
                    <input
                      id="feedback-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("your@email.com")}
                    />
                    <span className="input-hint">{t("We'll only use this to follow up on your feedback")}</span>
                  </div>

                  {submitError && <p className="feedback-error" role="alert">{t(submitError)}</p>}

                  <div className="feedback-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setIsOpen(false)}
                    >
                      {t("Cancel")}</button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmitting || !message.trim()}
                    >
                      {t(isSubmitting ? 'Sending...' : 'Send Feedback')}
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
