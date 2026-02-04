import { useState, useEffect, useCallback } from 'react';

/**
 * usePuter hook - Manages Puter.js integration for AI features
 * 
 * Puter.js provides free AI access without API keys through their CDN:
 * <script src="https://js.puter.com/v2/"></script>
 * 
 * Features available:
 * - puter.ai.chat() - Chat with 500+ AI models
 * - puter.ai.txt2img() - Image generation
 * - puter.ai.txt2speech() - Text to speech
 * - puter.fs.* - Cloud storage
 * 
 * @returns {Object} { isReady, error, chat, isLoading }
 */
export function usePuter() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    let checkInterval;

    const checkPuter = () => {
      try {
        if (window.puter && window.puter.ai && window.puter.ai.chat) {
          if (mounted) {
            setIsReady(true);
            setError(null);
            setIsLoading(false);
          }
          if (checkInterval) {
            clearInterval(checkInterval);
          }
          return true;
        }
        return false;
      } catch (err) {
        if (mounted) {
          setError(err.message);
          setIsLoading(false);
        }
        return false;
      }
    };

    // Check immediately
    if (!checkPuter()) {
      // Set up polling if not ready
      checkInterval = setInterval(() => {
        checkPuter();
      }, 500);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (mounted && !isReady) {
          setIsLoading(false);
          if (checkInterval) {
            clearInterval(checkInterval);
          }
        }
      }, 10000);
    }

    return () => {
      mounted = false;
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, []);

  /**
   * Chat with AI using Puter.js
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Chat options
   * @param {string} options.model - Model to use (default: 'gpt-5-nano')
   * @param {boolean} options.stream - Whether to stream the response
   * @returns {Promise<string|AsyncIterable>} Response or stream
   */
  const chat = useCallback(async (prompt, options = {}) => {
    if (!isReady || !window.puter?.ai?.chat) {
      throw new Error('Puter.js AI not ready');
    }

    const { model = 'gpt-5-nano', stream = false, ...otherOptions } = options;

    try {
      const response = await window.puter.ai.chat(prompt, {
        model,
        stream,
        ...otherOptions
      });

      if (stream) {
        // Return async iterable for streaming
        return response;
      } else {
        // Return text for non-streaming
        return response?.text || response?.message?.content || String(response);
      }
    } catch (err) {
      console.error('Puter.ai.chat error:', err);
      throw err;
    }
  }, [isReady]);

  return {
    isReady,
    error,
    isLoading,
    chat
  };
}

/**
 * Utility function to stream AI responses
 * @param {AsyncIterable} stream - The stream from puter.ai.chat
 * @param {Function} onChunk - Callback for each chunk
 * @returns {Promise<string>} Full response text
 */
export async function streamAIResponse(stream, onChunk) {
  let fullText = '';
  
  try {
    for await (const chunk of stream) {
      if (chunk?.text) {
        fullText += chunk.text;
        onChunk?.(chunk.text, fullText);
      }
    }
  } catch (err) {
    console.error('Stream error:', err);
    throw err;
  }
  
  return fullText;
}

export default usePuter;
