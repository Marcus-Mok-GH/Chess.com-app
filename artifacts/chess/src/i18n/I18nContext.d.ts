import type { Context, ReactNode } from 'react';

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: string, params?: TranslateParams) => string;

export interface I18nValue {
  locale: string;
  languageLabel: string;
  dir: 'ltr' | 'rtl';
  isLoaded: boolean;
  setLocale: (locale: string) => void;
  t: Translate;
  tCount: (count: number, singularKey: string, pluralKey: string, params?: TranslateParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDateTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
}

export declare function I18nProvider(props: { children?: ReactNode }): JSX.Element;
export declare function useI18n(): I18nValue;
export declare function useT(): Translate;
export declare function useLocale(): string;

declare const I18nContext: Context<I18nValue | null>;
export default I18nContext;