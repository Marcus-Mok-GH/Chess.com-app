import { describe, expect, it } from 'vitest';
import { CATALOGS } from './messages';
import { SUPPORTED_LOCALES, getInitialLocale, normalizeLocale } from './locales';
import { translate, translateCount } from './translate';

const ENGLISH = CATALOGS.en;
const ENGLISH_KEYS = Object.keys(ENGLISH);

function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('locale resolution', () => {
  it('maps regional and legacy tags onto shipped locales', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('zh-HK')).toBe('zh-TW');
    expect(normalizeLocale('zh-TW')).toBe('zh-TW');    expect(normalizeLocale('zh-Hant-TW')).toBe('zh-TW');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(normalizeLocale('ms-MY')).toBe('ms');
    expect(normalizeLocale('ta-IN')).toBe('ta');
    expect(normalizeLocale('hi-IN')).toBe('hi');
  });

  it('falls back to English for unsupported or missing tags', () => {
    expect(normalizeLocale('fr-FR')).toBe('en');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
  });

  it('exposes every shipped locale once', () => {
    const codes = SUPPORTED_LOCALES.map((locale) => locale.code);
    expect(codes).toEqual(['en', 'zh-CN', 'zh-TW', 'ms', 'ta', 'hi']);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('returns a usable locale before any preference is stored', () => {
    expect(SUPPORTED_LOCALES.map((locale) => locale.code)).toContain(getInitialLocale());
  });
});

describe('translation lookup', () => {
  it('returns the English source when no translation exists', () => {
    expect(translate('en', 'Play')).toBe('Play');
  });

  it('falls back to the source key instead of a token like ui.play', () => {
    expect(translate('ta', 'A string that is not in any catalog')).toBe(
      'A string that is not in any catalog',
    );
  });

  it('interpolates named placeholders and leaves unknown ones intact', () => {
    expect(translate('en', '{name} is thinking...', { name: 'Nelson' })).toBe('Nelson is thinking...');
    expect(translate('en', 'You played {move}', {})).toBe('You played {move}');
  });

  it('picks the plural form with Intl.PluralRules', () => {
    expect(translateCount('en', 1, '{count} game', '{count} games')).toBe('1 game');
    expect(translateCount('en', 3, '{count} game', '{count} games')).toBe('3 games');
    expect(translateCount('zh-CN', 3, '{count} game', '{count} games')).toBe(
      translate('zh-CN', '{count} games', { count: 3 }),
    );
  });
});

describe.each(SUPPORTED_LOCALES.map((locale) => locale.code))('%s catalog', (code) => {
  const catalog = CATALOGS[code];
  const isEnglish = code === 'en';

  it('translates every English key', () => {
    expect(catalog).toBeTruthy();
    const missing = ENGLISH_KEYS.filter((key) => {
      const value = catalog[key];
      return typeof value !== 'string' || !value.trim();
    });
    expect(missing).toEqual([]);
  });

  it('keeps placeholder names identical to the English source', () => {
    const mismatched = ENGLISH_KEYS.filter((key) => {
      const translated = catalog[key] || '';
      return placeholders(translated).join(',') !== placeholders(ENGLISH[key]).join(',');
    });
    expect(mismatched).toEqual([]);
  });

  it('does not invent keys the English source does not have', () => {
    const extra = Object.keys(catalog).filter((key) => !(key in ENGLISH));
    expect(extra).toEqual([]);
  });

  it('keeps every interface string translated', { skip: isEnglish }, () => {
    expect(catalog.Play).not.toBe('Play');
  });
});