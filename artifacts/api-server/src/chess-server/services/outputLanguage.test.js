import { describe, expect, it } from 'vitest';
import { languageInstruction, resolveOutputLanguage } from './outputLanguage.js';

describe('resolveOutputLanguage', () => {
  it.each([
    ['en', 'en'],
    ['zh-CN', 'zh-cn'],
    ['zh-Hans-CN', 'zh-cn'],
    ['zh-TW', 'zh-tw'],
    ['zh-Hant-TW', 'zh-tw'],
    ['zh-HK', 'zh-tw'],
    ['ms-MY', 'ms'],
    ['ta-IN', 'ta'],
    ['hi-IN', 'hi'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveOutputLanguage(input)).toBe(expected);
  });

  it('uses English for missing, malformed, and unsupported tags', () => {
    expect(resolveOutputLanguage(undefined)).toBe('en');
    expect(resolveOutputLanguage('')).toBe('en');
    expect(resolveOutputLanguage('fr-FR')).toBe('en');
    expect(resolveOutputLanguage({ language: 'hi' })).toBe('en');
  });
});

describe('languageInstruction', () => {
  it('leaves English prompts unchanged', () => {
    expect(languageInstruction('en')).toBe('');
    expect(languageInstruction('unknown')).toBe('');
  });

  it('names the selected language and protects structured chess output', () => {
    const instruction = languageInstruction('zh-Hant-TW');
    expect(instruction).toContain('Traditional Chinese (繁體中文)');
    expect(instruction).toContain('translate only the human-readable text values');
    expect(instruction).toContain('keep every JSON key, SAN move, and FEN string exactly as given');
  });
});
