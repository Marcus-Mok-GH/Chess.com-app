import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll when the route changes.
 *
 * The app scrolls inside `<main>`, not the window, so `window.scrollTo` alone
 * does nothing. Without this, a scroll picked up on one screen is inherited by
 * the next: leaving a tall setup screen for a game left the board clipped
 * above the fold, and a long game left the next page halfway down.
 *
 * @returns {null} Renders nothing.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset both the app's scroll container and the document, so pages that
    // scroll the window itself behave the same way.
    document.querySelector('main')?.scrollTo?.({ top: 0, left: 0 });
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
