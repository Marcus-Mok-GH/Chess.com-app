import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from '../hooks/useNotifications';
import { useT } from '../i18n/I18nContext';
import { getActiveLocale } from '../i18n/translate';

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 420;

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(getActiveLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Inbox bell for the app shell./**
 * Server-written notifications carry a template key alongside the English
 * fallback, so the inbox can follow the interface language. Rows written before
 * localisation shipped have no template and fall back to the stored text.
 *
 * @param {object} item Notification row.
 * @param {Function} t Translator from the interface locale.
 * @returns {{title: string, body: string}} Text to display.
 */
function notificationText(item, t) {
  const template = item?.payload?.i18n;
  if (!template?.titleKey || !template?.bodyKey) {
    return { title: item.title, body: item.body };
  }
  const params = template.params || {};
  // `summary` is the accused player plus their rating context. Building it here
  // rather than on the server keeps the time-control label in the reader's
  // language; the server cannot know which locale the inbox will render in.
  const bits = [params.poolLabel ? t(params.poolLabel) : null, params.elo != null ? `Elo ${params.elo}` : null].filter(
    Boolean,
  );
  const who = params.name || t('Your opponent');
  const summary = bits.length ? `${who} (${bits.join(' · ')})` : who;
  const merged = { ...params, summary };
  return { title: t(template.titleKey, merged), body: t(template.bodyKey, merged) };
}

/**
 * Inbox bell for the app shell. Renders nothing when signed out; the shared
 * store behind it is polled once for the whole shell, so mounting it in both
 * the desktop sidebar and the mobile header costs one request.
 *
 * The panel is positioned as `fixed` from the button's measured rect: the
 * sidebar is a scrolling container and the mobile header is sticky, so an
 * absolutely positioned dropdown would be clipped by either.
 */
export default function NotificationBell() {
  const t = useT();
  const { user, isLoggedIn } = useUser();
  const accountKey = isLoggedIn && user?.id ? user.id : null;
  const { items, unreadCount, loading, loaded, error } = useNotifications(accountKey);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click or Escape so the panel never traps the page.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Anchor the panel to the bell, flipping above it when the page bottom is
  // too close, and keep it anchored while the shell scrolls or resizes.
  useEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.right - width),
        Math.max(12, window.innerWidth - width - 12),
      );
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const above = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(200, Math.min(PANEL_MAX_HEIGHT, above ? spaceAbove : spaceBelow));
      setPanelStyle({
        position: 'fixed',
        width,
        left,
        maxHeight,
        ...(above
          ? { bottom: Math.max(12, window.innerHeight - rect.top + 8) }
          : { top: rect.bottom + 8 }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  if (!accountKey) return null;

  async function openItem(item) {
    if (!item.read_at) {
      try {
        await markNotificationRead(item.id);
      } catch {
        // Marking read is cosmetic; never block opening the item.
      }
    }
    setOpen(false);
    if (item.payload?.link) navigate(item.payload.link);
  }

  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        className="notification-bell-btn"
        aria-label={
          unreadCount > 0
            ? t('Notifications ({count} unread)', { count: unreadCount })
            : t('Notifications')
        }
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{badge}</span>}
      </button>

      {open && panelStyle && (
        <div className="notification-panel" style={panelStyle} aria-label={t("Notifications")}>
          <div className="notification-panel-head">
            <strong>{t("Notifications")}</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notification-mark-all"
                onClick={() => { markAllNotificationsRead().catch(() => {}); }}
              >
                {t("Mark all read")}</button>
            )}
          </div>

          <ul className="notification-list">
            {loading && !loaded && (
              <li className="notification-empty">{t("Loading…")}</li>
            )}
            {!loading && items.length === 0 && (
              <li className="notification-empty">{error || 'No notifications yet.'}</li>
            )}
            {items.map((item) => {
              const text = notificationText(item, t);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item${item.read_at ? '' : ' is-unread'}`}
                    onClick={() => openItem(item)}
                  >
                    <span className="notification-item-title">{text.title}</span>
                    <span className="notification-item-body">{text.body}</span>
                    <span className="notification-item-time">{formatWhen(item.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
