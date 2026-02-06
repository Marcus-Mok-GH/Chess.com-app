import { useState } from 'react';
import './WelcomeModal.css';

const QUESTIONS = [
  {
    id: 'skill_level',
    type: 'select',
    label: 'What\'s your chess experience level?',
    options: [
      { value: '', label: 'Select your level...' },
      { value: 'beginner', label: 'Beginner - Learning the basics' },
      { value: 'intermediate', label: 'Intermediate - Know strategies' },
      { value: 'advanced', label: 'Advanced - Experienced player' },
      { value: 'expert', label: 'Expert - Tournament player' },
    ],
    required: false,
  },
  {
    id: 'play_style',
    type: 'radio',
    label: 'How do you prefer to play?',
    options: [
      { value: 'aggressive', label: 'Aggressive - Attack and pressure' },
      { value: 'defensive', label: 'Defensive - Solid and careful' },
      { value: 'tactical', label: 'Tactical - Tricks and combinations' },
      { value: 'strategic', label: 'Strategic - Long-term planning' },
    ],
    required: false,
  },
  {
    id: 'learning_goal',
    type: 'radio',
    label: 'What\'s your main goal?',
    options: [
      { value: 'fun', label: 'Have fun and relax' },
      { value: 'improve', label: 'Improve my skills' },
      { value: 'compete', label: 'Compete and climb ranks' },
      { value: 'learn', label: 'Learn chess from scratch' },
    ],
    required: false,
  },
];

export default function WelcomeModal({ username, onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isWelcomeScreen = currentStep === 0;
  const currentQuestion = QUESTIONS[currentStep - 1];
  const totalSteps = QUESTIONS.length + 1; // +1 for welcome screen

  const handleAnswer = (questionId, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await onComplete(answers);
    } catch (error) {
      console.error('Failed to save onboarding answers:', error);
      // Still complete even if saving fails
      onComplete(answers);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  const canProceed = isWelcomeScreen || !currentQuestion.required || answers[currentQuestion?.id];

  return (
    <div className="welcome-modal-overlay">
      <div className="welcome-modal">
        {isWelcomeScreen ? (
          <>
            <div className="welcome-header">
              <h1>♟️ Welcome to Chess!</h1>
              <p>Hi {username}, let's get you started!</p>
            </div>

            <div className="welcome-content">
              <div className="welcome-message">
                <p>🎉 <strong>Your account has been created!</strong></p>
                <p>Welcome to our chess community. You're starting with an ELO rating of 1200.</p>
                <p>We'd love to personalize your experience. Mind answering a few quick questions?</p>
              </div>
            </div>

            <div className="welcome-actions">
              <button
                className="welcome-btn welcome-btn-secondary"
                onClick={handleSkip}
                disabled={isSubmitting}
              >
                Skip for now
              </button>
              <button
                className="welcome-btn welcome-btn-primary"
                onClick={handleNext}
                disabled={isSubmitting}
              >
                Let's go!
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="welcome-header">
              <h1>Question {currentStep} of {QUESTIONS.length}</h1>
            </div>

            <div className="welcome-content">
              <div className="onboarding-questions">
                <div className="question-group">
                  <label>{currentQuestion.label}</label>
                  
                  {currentQuestion.type === 'select' && (
                    <select
                      value={answers[currentQuestion.id] || ''}
                      onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                      autoFocus
                    >
                      {currentQuestion.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {currentQuestion.type === 'radio' && (
                    <div className="radio-group">
                      {currentQuestion.options.map(opt => (
                        <label
                          key={opt.value}
                          className={`radio-option ${answers[currentQuestion.id] === opt.value ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={currentQuestion.id}
                            value={opt.value}
                            checked={answers[currentQuestion.id] === opt.value}
                            onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="welcome-actions">
              <button
                className="welcome-btn welcome-btn-secondary"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                Back
              </button>
              <button
                className="welcome-btn welcome-btn-primary"
                onClick={handleNext}
                disabled={!canProceed || isSubmitting}
              >
                {currentStep === QUESTIONS.length ? 'Finish' : 'Next'}
              </button>
            </div>

            <div className="progress-dots">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <div
                  key={index}
                  className={`progress-dot ${index === currentStep ? 'active' : ''}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
