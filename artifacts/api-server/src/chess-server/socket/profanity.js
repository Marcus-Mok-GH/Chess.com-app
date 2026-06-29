const BAD_WORDS = [
  'fuck', 'shit', 'asshole', 'bitch', 'cunt', 'dick', 'pussy', 'faggot', 'nigger', 'bastard', 'slut', 'whore'
];

/**
 * Censored a message by replacing bad words with asterisks.
 * @param {string} text 
 * @returns {string}
 */
export function censorMessage(text) {
  if (!text || typeof text !== 'string') return text;
  
  let censored = text;
  for (const word of BAD_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    censored = censored.replace(regex, '*'.repeat(word.length));
  }
  
  return censored;
}
