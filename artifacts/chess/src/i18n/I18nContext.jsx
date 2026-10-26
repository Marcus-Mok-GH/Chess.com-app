import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { DEFAULT_LOCALE, getLocaleInfo, normalizeLocale, storeLocale } from './locales';
import {
  formatDateTime,
  formatNumber,
  setActiveLocale,
  translate,
  translateCount,
} from './translate';

const I18nContext = createContext(null);

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function buildValue(locale, setLocale, isLoaded) {
  const info = getLocaleInfo(locale);
  return {
    locale,
    languageLabel: info.label,
    dir: info.dir,
    isLoaded,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    tCount: (count, singularKey, pluralKey, params) =>
      translateCount(locale, count, singularKey, pluralKey, params),
    formatNumber: (value, options) => formatNumber(locale, value, options),
    formatDateTime: (value, options) => formatDateTime(locale, value, options),
  };
}

const noop = () => {};

// Components rendered outside the provider (unit tests, isolated stories) keep
// working in English instead of throwing.
const FALLBACK_VALUE = buildValue(DEFAULT_LOCALE, noop, true);

/**
 * Reads the selected language from user settings (which also persists it) and
 * exposes translation helpers. Sits inside `SettingsProvider`.
 */
export function I18nProvider({ children }) {
  const { settings, updateSettings, isLoaded } = useSettings();
  const locale = normalizeLocale(settings?.language);
  const [syncedLocale, setSyncedLocale] = useState(null);

  useIsomorphicLayoutEffect(() => {
    setActiveLocale(locale);
    storeLocale(locale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    setSyncedLocale(locale);
  }, [locale]);

  const setLocale = useCallback(
    (next) => {
      updateSettings({ language: normalizeLocale(next) });
    },
    [updateSettings],
  );

  const value = useMemo(
    () => buildValue(locale, setLocale, isLoaded),
    [locale, setLocale, isLoaded, syncedLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext) || FALLBACK_VALUE;
}

/** Translation function for the active locale: `const t = useT(); t('Play')`. */
export function useT() {
  return useI18n().t;
}

export function useLocale() {
  return useI18n().locale;
}

export default I18nContext;