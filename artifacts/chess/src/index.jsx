import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './App.css'

// Handle Vite dynamic import failures (happens after new deployments)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error detected, reloading page...', event);
  window.location.reload();
});

// Generic handler for TypeError on dynamic imports
window.addEventListener('error', (event) => {
  if (event.message?.includes('Failed to fetch dynamically imported module') || 
      event.message?.includes('Importing a module script failed')) {
    console.warn('Module fetch error, reloading...', event);
    window.location.reload();
  }
}, true);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // Production: unregister old service workers and purge their caches.
    // The old worker cached the app shell and served it stale-first, so
    // after a deploy browsers could render HTML whose fingerprinted asset
    // links 404 (a completely unstyled page). Removing the Cache Storage
    // entries ensures the stale shell can never be served again.
    navigator.serviceWorker.ready
      .then(registration => registration.unregister())
      .then(() => {
        if (typeof caches !== 'undefined' && window.caches?.keys) {
          return window.caches.keys().then(names =>
            Promise.all(names.map(name => window.caches.delete(name)))
          );
        }
        return undefined;
      })
      .then(() => {
        console.log('Service worker unregistered, caches purged');
      })
      .catch(() => {});
  }
}

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
const root = document.getElementById('root');

// The server-rendered shell can include browser-only state (session, settings,
// and viewport-dependent UI). Render the client tree from scratch so those
// values cannot trigger hydration mismatches after deployment.
createRoot(root).render(app);
