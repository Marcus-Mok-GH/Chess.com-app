export const DEFAULT_LOCALE = 'en';

const STORAGE_KEY = 'playchess.locale';

/**
 * Shipped languages. `nativeName` is what users see in the picker, so each
 * option reads the way its speakers write it.
 */
export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'zh-CN', label: '简体中文', dir: 'ltr' },
  { code: 'zh-TW', label: '繁體中文', dir: 'ltr' },
  { code: 'ms', label: 'Bahasa Melayu', dir: 'ltr' },
  { code: 'ta', label: 'தமிழ்', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
];

const LOCALE_CODES = SUPPORTED_LOCALES.map((locale) => locale.code);

const ALIASES = {
  zh: 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-my': 'zh-CN',
  'zh-hant': 'zh-TW',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
};

/**
 * Map any tag the browser or a saved setting might hand us onto a shipped
 * locale. Unknown tags fall back to English rather than breaking the UI.
 */
export function normalizeLocale(value) {
  if (!value || typeof value !== 'string') return DEFAULT_LOCALE;

  const trimmed = value.trim().replace(/_/g, '-');
  if (!trimmed) return DEFAULT_LOCALE;

  const exact = LOCALE_CODES.find((code) => code.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const lowered = trimmed.toLowerCase();
  const subtags = lowered.split('-');
  if (subtags[0] === 'zh') {
    if (subtags.includes('hant') || ['tw', 'hk', 'mo'].includes(subtags.at(-1))) return 'zh-TW';
    if (subtags.includes('hans') || ['cn', 'sg', 'my'].includes(subtags.at(-1))) return 'zh-CN';
  }
  if (ALIASES[lowered]) return ALIASES[lowered];

  const base = lowered.split('-')[0];
  if (ALIASES[base]) return ALIASES[base];

  const baseMatch = LOCALE_CODES.find((code) => code.toLowerCase() === base);
  return baseMatch || DEFAULT_LOCALE;
}

export function isSupportedLocale(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = normalizeLocale(value);
  if (normalized !== DEFAULT_LOCALE) return true;
  return value.trim().replace(/_/g, '-').split('-')[0].toLowerCase() === 'en';
}

export function getLocaleInfo(locale) {
  const normalized = normalizeLocale(locale);
  return SUPPORTED_LOCALES.find((entry) => entry.code === normalized) || SUPPORTED_LOCALES[0];
}

function readStoredLocale() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

export function storeLocale(locale) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeLocale(locale));
  } catch (error) {
    // Private mode or a full quota should never break the app.
  }
}

function detectBrowserLocale() {
  if (typeof navigator === 'undefined') return null;

  const candidates = [];
  if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
  if (navigator.language) candidates.push(navigator.language);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeLocale(candidate);
    if (normalized !== DEFAULT_LOCALE || String(candidate).toLowerCase().startsWith('en')) {
      return normalized;
    }
  }
  return null;
}

/**
 * Locale to use before any saved preference is read: an explicit choice from a
 * previous visit wins, then the browser's preferred language, then English.
 */
export function getInitialLocale() {
  const stored = readStoredLocale();
  if (isSupportedLocale(stored)) return normalizeLocale(stored);
  return detectBrowserLocale() || DEFAULT_LOCALE;
}