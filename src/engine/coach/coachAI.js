import { API_BASE_URL, isNetworkError } from '../../services/apiBase';

let coachAvailable = null;

/**
 * Check if the AI coach is available
 */
export async function isCoachAIAvailable() {
  if (coachAvailable !== null) {
    return coachAvailable;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/coach/status`);
    if (response.ok) {
      const data = await response.json();
      coachAvailable = data.available;
      return coachAvailable;
    }
  } catch (error) {
    console.error('[CoachAI] Status check failed:', error);
  }
  
  coachAvailable = false;
  return false;
}

/**
 * Get AI coaching feedback for a player's move
 * Uses Mistral AI magistral-medium-latest reasoning model via server API
 */
export async function getCoachingFeedback(fen, playerMove, moveHistory, onStream = null) {
  try {
    const enableStream = typeof onStream === 'function';
    
    const response = await fetch(`${API_BASE_URL}/coach/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, playerMove, moveHistory, stream: enableStream })
    });

    if (!response.ok) {
      console.error('[CoachAI] Feedback request failed:', response.status);
      return null;
    }

    if (enableStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullText += parsed.content;
                  onStream(fullText);
                }
              } catch (e) {
                console.warn('[CoachAI] Failed to parse stream data:', e);
              }
            }
          }
        }
      } catch (error) {
        console.error('[CoachAI] Stream reading error:', error);
      }

      return fullText || null;
    } else {
      const data = await response.json();
      const feedback = data.feedback || null;
      
      if (onStream && feedback) {
        onStream(feedback);
      }
      
      return feedback;
    }
  } catch (error) {
    if (isNetworkError(error)) {
      console.error('[CoachAI] Feedback network error:', error.message);
      return null;
    }
    console.error('[CoachAI] Feedback error:', error);
    return null;
  }
}

/**
 * Get AI explanation for the coach's move
 * Uses Mistral AI magistral-medium-latest reasoning model via server API
 */
export async function explainCoachMove(fenBefore, move, fenAfter, onStream = null) {
  try {
    const enableStream = typeof onStream === 'function';
    
    const response = await fetch(`${API_BASE_URL}/coach/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fenBefore, move, fenAfter, stream: enableStream })
    });

    if (!response.ok) {
      console.error('[CoachAI] Explain request failed:', response.status);
      return null;
    }

    if (enableStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullText += parsed.content;
                  onStream(fullText);
                }
              } catch (e) {
                console.warn('[CoachAI] Failed to parse stream data:', e);
              }
            }
          }
        }
      } catch (error) {
        console.error('[CoachAI] Stream reading error:', error);
      }

      return fullText || null;
    } else {
      const data = await response.json();
      const explanation = data.explanation || null;
      
      if (onStream && explanation) {
        onStream(explanation);
      }
      
      return explanation;
    }
  } catch (error) {
    if (isNetworkError(error)) {
      console.error('[CoachAI] Explain network error:', error.message);
      return null;
    }
    console.error('[CoachAI] Explain error:', error);
    return null;
  }
}

/**
 * Analyze a complete game with move-by-move reviews
 * Uses Mistral AI magistral-medium-latest reasoning model via server API
 */
export async function analyzeGame(moveHistory, result, gameId = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/coach/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moveHistory,
        result,
        gameId
      })
    });

    if (!response.ok) {
      console.error('[CoachAI] Analyze request failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.analysis || null;
  } catch (error) {
    if (isNetworkError(error)) {
      console.error('[CoachAI] Analyze network error:', error.message);
      return null;
    }
    console.error('[CoachAI] Analyze error:', error);
    return null;
  }
}
