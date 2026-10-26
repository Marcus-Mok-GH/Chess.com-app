// The coach answers in whatever language the app is currently set to. The
// client sends its locale with every coach request; this module turns that tag
// into an instruction the model can follow, and never lets an unknown tag
// through as free text.

const LANGUAGE_NAMES = {
  en: 'English',
  'zh-cn': 'Simplified Chinese (简体中文)',
  'zh-tw': 'Traditional Chinese (繁體中文)',
  ms: 'Malay (Bahasa Melayu)',
  ta: 'Tamil (தமிழ்)',
  hi: 'Hindi (हिन्दी)',
};

const ALIASES = {
  zh: 'zh-cn',
  'zh-hans': 'zh-cn',
  'zh-sg': 'zh-cn',
  'zh-my': 'zh-cn',
  'zh-hant': 'zh-tw',
  'zh-hk': 'zh-tw',
  'zh-mo': 'zh-tw',
  'ms-my': 'ms',
  'ta-in': 'ta',
  'ta-lk': 'ta',
  'hi-in': 'hi',
};

/**
 * Map a client locale tag onto a supported output language.
 *
 * @param {unknown} value Locale sent by the client, e.g. `zh-TW`.
 * @returns {string} Canonical lowercase locale code, `en` when unknown.
 */
export function resolveOutputLanguage(value) {
  if (!value || typeof value !== 'string') return 'en';
  const lowered = value.trim().replace(/_/g, '-').toLowerCase();
  if (!lowered) return 'en';
  if (LANGUAGE_NAMES[lowered]) return lowered;
  const subtags = lowered.split('-');
  if (subtags[0] === 'zh') {
    if (subtags.includes('hant') || ['tw', 'hk', 'mo'].includes(subtags.at(-1))) return 'zh-tw';
    if (subtags.includes('hans') || ['cn', 'sg', 'my'].includes(subtags.at(-1))) return 'zh-cn';
  }
  if (ALIASES[lowered]) return ALIASES[lowered];
  const base = lowered.split('-')[0];
  if (LANGUAGE_NAMES[base]) return base;
  if (ALIASES[base]) return ALIASES[base];
  return 'en';
}

/**
 * Prompt suffix that pins the reply language. English needs no instruction, so
 * this returns an empty string for the default locale.
 *
 * @param {unknown} value Locale sent by the client.
 * @returns {string} Text to append to the coach system prompt.
 */
export function languageInstruction(value) {
  const locale = resolveOutputLanguage(value);
  if (locale === 'en') return '';
  const name = LANGUAGE_NAMES[locale];
  return `\n\nLANGUAGE: Write your entire response in ${name}. If you return JSON, translate only the human-readable text values (such as "review") and keep every JSON key, SAN move, and FEN string exactly as given.`;
}

export default { resolveOutputLanguage, languageInstruction };