const CACHE_NAME = 'chess-app-v3';

// Immutable, fingerprinted assets (hashed filenames) can be cached
// aggressively. The app shell ('/', '/index.html') is intentionally NOT
// cached: it references fingerprinted assets whose hashes change on every
// deploy, and a stale cached shell serves HTML that links to dead asset
// URLs (the "unstyled page" bug).
const OFFLINE_FALLBACKS = [
  '/favicon.svg',
  // Legacy paths
  '/pieces/wK.svg',
  '/pieces/wQ.svg',
  '/pieces/wR.svg',
  '/pieces/wB.svg',
  '/pieces/wN.svg',
  '/pieces/wP.svg',
  '/pieces/bK.svg',
  '/pieces/bQ.svg',
  '/pieces/bR.svg',
  '/pieces/bB.svg',
  '/pieces/bN.svg',
  '/pieces/bP.svg',

  // Custom piece set (used by all pages)
  '/custom-pieces/wK.svg',
  '/custom-pieces/wQ.svg',
  '/custom-pieces/wR.svg',
  '/custom-pieces/wB.svg',
  '/custom-pieces/wN.svg',
  '/custom-pieces/wP.svg',
  '/custom-pieces/bK.svg',
  '/custom-pieces/bQ.svg',
  '/custom-pieces/bR.svg',
  '/custom-pieces/bB.svg',
  '/custom-pieces/bN.svg',
];

// Install event - cache immutable static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(OFFLINE_FALLBACKS);
      })
      .then(() => {
        console.log('[ServiceWorker] Static assets cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[ServiceWorker] Cache failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[ServiceWorker] Activated');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests - let them fail naturally when offline
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Skip WebSocket requests
  if (request.mode === 'websocket' || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Navigations (page loads) MUST be network-first: the HTML references
  // fingerprinted assets for the current deployment. Serving a cached,
  // outdated HTML shell makes every one of its asset links 404 and the
  // page renders completely unstyled.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Offline: fall back to whatever shell we may have from a
          // previous visit, or a minimal error page.
          return caches
            .match(request)
            .then((cached) => cached || caches.match('/index.html'))
            .then((cached) => cached || Response.error());
        })
    );
    return;
  }

  // Static assets: cache-first with background refresh (stale-while-
  // revalidate). Fingerprinted /assets/* files are immutable, so a cache
  // hit is always valid. Non-fingerprinted files (sounds, images) get
  // refreshed in the background.
  const isFingerprinted = url.pathname.startsWith('/assets/');

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse && isFingerprinted) {
        return cachedResponse;
      }

      if (cachedResponse) {
        // Refresh non-fingerprinted assets in the background
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          })
          .catch(() => {
            // Network failed, but we have cached version - that's fine
          });

        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse.ok) {
            return networkResponse;
          }

          // Cache successful responses
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch((error) => {
          console.error('[ServiceWorker] Fetch failed:', error);
          throw error;
        })
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
