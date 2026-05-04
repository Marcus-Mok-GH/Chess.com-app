export const normalizeApiBaseUrl = (rawBaseUrl) => {
  if (!rawBaseUrl) return '/api'
  const trimmed = rawBaseUrl.trim()
  if (!trimmed) return '/api'

  const lower = trimmed.toLowerCase()
  if (lower === 'api' || lower === 'api/') {
    return '/api'
  }

  let base = trimmed

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(base)
  if (!hasProtocol && !base.startsWith('/')) {
    const looksLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(base)
    const protocol = looksLocal ? 'http://' : 'https://'
    base = `${protocol}${base}`
  }

  if (/\/api\/?$/.test(base)) {
    return base.replace(/\/$/, '')
  }
  return `${base.replace(/\/$/, '')}/api`
}

const clientApiUrl = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL;

export const API_BASE_URL = normalizeApiBaseUrl(clientApiUrl)

export const isNetworkError = (error) => {
  const message = error?.message || ''
  return error?.name === 'TypeError'
    || message === 'Load failed'
    || message === 'Failed to fetch'
    || message.includes('NetworkError')
    || message.toLowerCase().includes('network')
}
