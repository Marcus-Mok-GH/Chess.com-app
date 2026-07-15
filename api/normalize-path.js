const STRIPPED_API_SEGMENTS = new Set([
  'auth',
  'coach',
  'engine',
  'games',
  'matchmaking',
  'stats',
  'users',
  'health',
]);

/**
 * Vercel catch-all functions can receive either the original `/api/...` URL or
 * the path after the function prefix has been matched. Only restore the prefix
 * for known API route families; unrelated paths are left untouched so we do not
 * accidentally rewrite frontend/static requests into API requests.
 */
export function normalizeApiRequestUrl(url) {
  if (!url || url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
    return url;
  }

  const [pathname, suffix = ''] = url.split(/(?=[?#])/, 2);
  const firstSegment = pathname.replace(/^\/+/, '').split('/')[0];

  if (!STRIPPED_API_SEGMENTS.has(firstSegment)) {
    return url;
  }

  return `/api${pathname.startsWith('/') ? '' : '/'}${pathname}${suffix}`;
}
