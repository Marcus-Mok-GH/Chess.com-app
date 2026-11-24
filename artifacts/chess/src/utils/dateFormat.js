import { formatDateTime, getActiveLocale } from '../i18n/translate';

export const formatChartDate = (dateString) =>
  formatDateTime(getActiveLocale(), dateString, { month: 'short', day: 'numeric' });

export const formatGameDate = (dateString) =>
  formatDateTime(getActiveLocale(), dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export const formatGameDateTime = (dateString) =>
  formatDateTime(getActiveLocale(), dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatNotificationWhen = (value) =>
  formatDateTime(getActiveLocale(), value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
