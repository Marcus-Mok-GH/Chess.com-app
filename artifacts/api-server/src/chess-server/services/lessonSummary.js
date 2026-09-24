// Lesson concepts are shown in a small sidebar card on the Puzzles page, where
// users skim rather than read. Whatever the coach model returns, the summary
// must stay at 1-2 short sentences within a strict word cap.

const MAX_SUMMARY_WORDS = 22;
const MAX_SUMMARY_SENTENCES = 2;

/**
 * Splits text into sentences. A period only counts as a sentence boundary when
 * it does not belong to a single-letter abbreviation ("e.g.", "i.e.") or a
 * numbered chess move ("1. e4"); such fragments are merged back into the
 * sentence they belong to.
 *
 * @param {string} text Normalized single-spaced text.
 * @returns {string[]} Sentence fragments, abbreviations kept intact.
 */
export function splitSentences(text) {
  const parts = text.split(/(?<=[.!?])\s+/);
  const sentences = [];
  for (const part of parts) {
    const prev = sentences[sentences.length - 1];
    if (prev && /(?:\b[a-z]\.|\b\d+\.)$/i.test(prev.trim())) {
      sentences[sentences.length - 1] = `${prev} ${part}`;
    } else {
      sentences.push(part);
    }
  }
  return sentences;
}

/**
 * Caps a lesson concept at a small number of short sentences so the Lesson
 * Concept card stays skim-readable whatever the coach model returns.
 *
 * @param {string | string[] | null | undefined} raw Model output or lesson
 *   description (string or array of paragraphs).
 * @param {object} [options]
 * @param {number} [options.maxWords=22] Total word cap across kept sentences.
 * @param {number} [options.maxSentences=2] Maximum sentences to keep.
 * @returns {string} The trimmed concept, at most `maxWords` words long.
 */
export function trimLessonSummary(
  raw,
  { maxWords = MAX_SUMMARY_WORDS, maxSentences = MAX_SUMMARY_SENTENCES } = {}
) {
  const joined = Array.isArray(raw) ? raw.join(' ') : String(raw || '');
  const cleaned = joined.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  let kept = '';
  for (const sentence of splitSentences(cleaned).slice(0, maxSentences)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const next = kept ? `${kept} ${trimmed}` : trimmed;
    if (next.split(' ').filter(Boolean).length > maxWords) break;
    kept = next;
  }
  if (kept) return kept;

  // A single runaway sentence: hard-trim at the word cap.
  const words = cleaned.split(' ').filter(Boolean);
  return `${words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '')}…`;
}
