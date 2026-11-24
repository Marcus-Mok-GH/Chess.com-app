import { getActiveLocale } from '../i18n/translate';

export const formatChartDate = (dateString) =>
  new Date(dateString).toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric' });
