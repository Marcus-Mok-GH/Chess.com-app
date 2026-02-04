const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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
 * Uses Mistral AI mistral-large-latest model via server API
 */
export async function getCoachingFeedback(fen, playerMove, moveHistory, onStream = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/coach/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, playerMove, moveHistory })
    });

    if (!response.ok) {
      console.error('[CoachAI] Feedback request failed:', response.status);
      return null;
    }

    const data = await response.json();
    const feedback = data.feedback || null;
    
    if (onStream && feedback) {
      onStream(feedback);
    }
    
    return feedback;
  } catch (error) {
    console.error('[CoachAI] Feedback error:', error);
    return null;
  }
}

/**
 * Get AI explanation for the coach's move
 * Uses Mistral AI mistral-large-latest model via server API
 */
export async function explainCoachMove(fenBefore, move, fenAfter, onStream = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/coach/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fenBefore, move, fenAfter })
    });

    if (!response.ok) {
      console.error('[CoachAI] Explain request failed:', response.status);
      return null;
    }

    const data = await response.json();
    const explanation = data.explanation || null;
    
    if (onStream && explanation) {
      onStream(explanation);
    }
    
    return explanation;
  } catch (error) {
    console.error('[CoachAI] Explain error:', error);
    return null;
  }
}

/**
 * Analyze a complete game with move-by-move reviews
 * Uses Mistral AI mistral-large-latest model via server API
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
    console.error('[CoachAI] Analyze error:', error);
    return null;
  }
}
