// Lesson concepts are shown in a small sidebar card on the Puzzles page, where
// users skim rather than read. Whatever the coach model returns, the summary
// must stay at 1-2 short sentences within a strict word cap.

const MAX_SUMMARY_WORDS = 22;
const MAX_SUMMARY_SENTENCES = 2;

export function trimLessonSummary(
  raw,
  { maxWords = MAX_SUMMARY_WORDS, maxSentences = MAX_SUMMARY_SENTENCES } = {}
) {
  const joined = Array.isArray(raw) ? raw.join(' ') : String(raw || '');
  const cleaned = joined.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const sentences = cleaned.match(/[^.!?]+[.!?]*/g) || [cleaned];
  let kept = '';
  for (const candidate of sentences.slice(0, maxSentences)) {
    const sentence = candidate.trim();
    if (!sentence) continue;
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (next.split(' ').filter(Boolean).length > maxWords) break;
    kept = next;
  }
  if (kept) return kept;

  // A single runaway sentence: hard-trim at the word cap.
  const words = cleaned.split(' ').filter(Boolean);
  return `${words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '')}…`;
}
