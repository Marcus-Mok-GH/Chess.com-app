// Lesson concepts are shown in a small sidebar card on the Puzzles page, where
// users skim rather than read. Whatever the coach model returns, the summary
// must stay at 1-2 short sentences within a strict word cap.

const MAX_SUMMARY_WORDS = 22;
const MAX_SUMMARY_SENTENCES = 2;

// Chinese writes a sentence in far fewer characters than English does in words,
// so a word cap would let a concept run to several lines. Cap by characters
// instead, using a deliberately generous words-to-characters ratio.
const CJK_CHAR_RATIO = 4.5;
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_SENTENCE_END = /[。！？!?]/;

function trimCjkSummary(text, maxCharacters) {
  const chars = Array.from(text);
  if (chars.length <= maxCharacters) return text;
  const slice = chars.slice(0, maxCharacters).join('');
  let cut = -1;
  for (let index = slice.length - 1; index >= 0; index -= 1) {
    if (CJK_SENTENCE_END.test(slice[index])) {
      cut = index;
      break;
    }
  }
  if (cut >= Math.floor(maxCharacters * 0.6)) return slice.slice(0, cut + 1);
  const trimmed = Array.from(slice.replace(/[，、,;:]$/, ''));
  return `${trimmed.slice(0, Math.max(0, maxCharacters - 1)).join('')}…`;
}

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
 * @param {number} [options.maxCharacters] Character cap; defaults to a
 *   word-equivalent cap for Chinese text and is ignored otherwise.
 * @returns {string} The trimmed concept, at most `maxWords` words long.
 */
export function trimLessonSummary(
  raw,
  {
    maxWords = MAX_SUMMARY_WORDS,
    maxSentences = MAX_SUMMARY_SENTENCES,
    maxCharacters,
  } = {}
) {
  const joined = Array.isArray(raw) ? raw.join(' ') : String(raw || '');
  const cleaned = joined.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  if (CJK_PATTERN.test(cleaned)) {
    return trimCjkSummary(cleaned, maxCharacters || Math.round(maxWords * CJK_CHAR_RATIO));
  }

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
