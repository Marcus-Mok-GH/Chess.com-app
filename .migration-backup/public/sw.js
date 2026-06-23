const CACHE_NAME = 'chess-app-v2';

// Assets to cache immediately on install.
// IMPORTANT: Do NOT cache Vite /src/* module paths. In dev they are served by Vite,
// in prod they don't exist (bundled assets are fingerprinted).
//
// Keep this list minimal and stable.
const STATIC_ASSETS = [
  '/',
  '/index.html',
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
  '/custom-pieces/bP.svg',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
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

// Fetch event - serve from cache or network
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

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // Return cached response if available
      if (cachedResponse) {
        // Fetch in background to update cache
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
          
          // For navigation requests, return the cached index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }

          throw error;
        });
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
