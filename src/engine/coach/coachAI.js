import { API_BASE_URL, isNetworkError } from '../../services/apiBase';

let coachAvailable = null;

async function consumeCoachStream(response, onDelta) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming unavailable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let currentEvent = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        currentEvent = null;
        continue;
      }

      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
        continue;
      }

      if (!line.startsWith('data:')) {
        continue;
      }

      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        return fullText;
      }

      if (currentEvent === 'error') {
        try {
          const payload = JSON.parse(data);
          throw new Error(payload?.error || 'Stream error');
        } catch (error) {
          throw error;
        }
      }

      let delta = '';
      if (data.startsWith('{') || data.startsWith('[')) {
        try {
          const payload = JSON.parse(data);
          if (payload?.error) {
            throw new Error(payload.error);
          }
          delta = payload?.delta || payload?.text || payload?.chunk || '';
        } catch (error) {
          delta = data;
        }
      } else {
        delta = data;
      }

      if (delta) {
        fullText += delta;
        onDelta?.(delta, fullText);
      }
    }
  }

  return fullText;
}

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
    const wantsStream = typeof onStream === 'function';
    const response = await fetch(`${API_BASE_URL}/coach/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(wantsStream ? { 'Accept': 'text/event-stream' } : {})
      },
      body: JSON.stringify({
        fen,
        playerMove,
        moveHistory,
        stream: wantsStream
      })
    });

    if (!response.ok) {
      console.error('[CoachAI] Feedback request failed:', response.status);
      return null;
    }

    if (wantsStream) {
      const fullText = await consumeCoachStream(response, (delta, fullText) => {
        onStream?.(fullText, delta);
      });
      return fullText || null;
    }

    const data = await response.json();
    const feedback = data.feedback || null;
    
    if (onStream && feedback) {
      onStream(feedback);
    }
    
    return feedback;
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
 * Uses Mistral AI mistral-large-latest model via server API
 */
export async function explainCoachMove(fenBefore, move, fenAfter, onStream = null) {
  try {
    const wantsStream = typeof onStream === 'function';
    const response = await fetch(`${API_BASE_URL}/coach/explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(wantsStream ? { 'Accept': 'text/event-stream' } : {})
      },
      body: JSON.stringify({
        fenBefore,
        move,
        fenAfter,
        stream: wantsStream
      })
    });

    if (!response.ok) {
      console.error('[CoachAI] Explain request failed:', response.status);
      return null;
    }

    if (wantsStream) {
      const fullText = await consumeCoachStream(response, (delta, fullText) => {
        onStream?.(fullText, delta);
      });
      return fullText || null;
    }

    const data = await response.json();
    const explanation = data.explanation || null;
    
    if (onStream && explanation) {
      onStream(explanation);
    }
    
    return explanation;
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
 * Uses Mistral AI mistral-large-latest model via server API
 */
export async function analyzeGame(moveHistory, result, gameId = null, onStream = null) {
  try {
    const wantsStream = typeof onStream === 'function';
    const response = await fetch(`${API_BASE_URL}/coach/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(wantsStream ? { 'Accept': 'text/event-stream' } : {})
      },
      body: JSON.stringify({
        moveHistory,
        result,
        gameId,
        stream: wantsStream
      })
    });

    if (!response.ok) {
      console.error('[CoachAI] Analyze request failed:', response.status);
      return null;
    }

    if (wantsStream) {
      const fullText = await consumeCoachStream(response, (delta, fullText) => {
        onStream?.(fullText, delta);
      });
      return fullText || null;
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
