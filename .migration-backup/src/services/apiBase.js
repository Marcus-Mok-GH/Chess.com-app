export const normalizeApiBaseUrl = (rawBaseUrl) => {
  // If undefined, null, empty string, or the literal string "undefined" (common Vite build artifact)
  if (!rawBaseUrl || rawBaseUrl === 'undefined') return '/api'

  const trimmed = rawBaseUrl.trim()
  if (!trimmed || trimmed === 'undefined') return '/api'

  const lower = trimmed.toLowerCase()
  if (lower === 'api' || lower === 'api/') {
    return '/api'
  }

  let base = trimmed

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(base)
  if (!hasProtocol && !base.startsWith('/')) {
    const looksLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(base)
    const browserProtocol = typeof window !== 'undefined' && window.location?.protocol
      ? `${window.location.protocol}//`
      : null
    const protocol = looksLocal ? 'http://' : (browserProtocol || 'https://')
    base = `${protocol}${base}`
  }

  // Prevent double /api/api
  if (/\/api\/?$/.test(base)) {
    return base.replace(/\/$/, '')
  }
  return `${base.replace(/\/$/, '')}/api`
}

const clientApiUrl = import.meta.env.VITE_API_URL;

export const API_BASE_URL = normalizeApiBaseUrl(clientApiUrl)

export const isNetworkError = (error) => {
  const message = error?.message || ''
  const name = error?.name || ''

  return name === 'TypeError'
    || message === 'Load failed'
    || message === 'Failed to fetch'
    || message.includes('NetworkError')
    || message.toLowerCase().includes('network')
    || message.toLowerCase().includes('aborted')
}
