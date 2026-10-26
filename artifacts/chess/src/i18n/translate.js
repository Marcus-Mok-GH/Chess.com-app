import { CATALOGS } from './messages';
import { DEFAULT_LOCALE, normalizeLocale } from './locales';

// Non-React callers (the coach client, notification helpers) need the current
// language without a hook. The provider keeps this in sync on every change.
let activeLocale = DEFAULT_LOCALE;

export function setActiveLocale(locale) {
  activeLocale = normalizeLocale(locale);
}

export function getActiveLocale() {
  return activeLocale;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function lookup(locale, key) {
  const catalog = CATALOGS[locale] || CATALOGS[DEFAULT_LOCALE];
  const value = catalog?.[key];
  if (typeof value === 'string') return value;

  const fallback = CATALOGS[DEFAULT_LOCALE]?.[key];
  if (typeof fallback === 'string') return fallback;

  return typeof key === 'string' ? key : '';
}

/**
 * Translate an English source string. Missing keys fall back to the English
 * source, then to the key itself, so a partially translated locale still reads
 * correctly instead of showing `ui.play.button` style tokens.
 */
export function translate(locale, key, params) {
  if (!key) return '';
  return interpolate(lookup(normalizeLocale(locale), key), params);
}

/**
 * Plural-aware translation. Pass both English forms; the right one is picked
 * with `Intl.PluralRules` for the active locale (Chinese and Malay only use
 * "other", Tamil and Hindi largely follow "one"/"other").
 */
export function translateCount(locale, count, singularKey, pluralKey, params) {
  const normalized = normalizeLocale(locale);
  const category = selectPluralCategory(normalized, count);
  const key = category === 'one' ? singularKey : pluralKey;
  return translate(normalized, key, { ...params, count });
}

let pluralRulesCache = new Map();

function selectPluralCategory(locale, count) {
  try {
    let rules = pluralRulesCache.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      pluralRulesCache.set(locale, rules);
    }
    return rules.select(Number(count));
  } catch (error) {
    return Number(count) === 1 ? 'one' : 'other';
  }
}

/** Translate with the active locale, for code that runs outside a component. */
export function tNow(key, params) {
  return translate(activeLocale, key, params);
}

export function formatNumber(locale, value, options) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '');
  try {
    return new Intl.NumberFormat(normalizeLocale(locale), options).format(numeric);
  } catch (error) {
    return String(numeric);
  }
}

export function formatDateTime(locale, value, options) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(normalizeLocale(locale), options).format(date);
  } catch (error) {
    return date.toDateString();
  }
}

export { DEFAULT_LOCALE };