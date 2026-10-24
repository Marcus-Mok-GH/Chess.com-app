import fs from 'node:fs'
import path from 'node:path'

const TEMPLATE_PATH = path.join(process.cwd(), 'dist', 'index.html')

function getRenderUrl(req) {
  const requestUrl = new URL(req.url || '/', 'http://localhost')
  const route = requestUrl.searchParams.get('__route') || requestUrl.pathname
  requestUrl.searchParams.delete('__route')
  const diagnostic = requestUrl.searchParams.get('__ssr_diagnostic') === '1'
  requestUrl.searchParams.delete('__ssr_diagnostic')
  const query = requestUrl.searchParams.toString()
  return { url: route + (query ? '?' + query : ''), diagnostic }
}

// ── Session-aware SSR ──────────────────────────────────────────────────────
// When the incoming request carries a valid session (Bearer token or the
// httpOnly `chess_session` cookie), the renderer seeds UserContext with the
// validated user so the server HTML already shows the personalized shell.
// The same user object is embedded as a one-shot inline payload (the same
// pattern the Puzzles page uses for its initial puzzle) so the first client
// render matches the server HTML exactly. Session tokens never travel into
// the HTML or the payload — the httpOnly cookie stays the only credential.
export const SSR_USER_KEY = '__SSR_USER__'
export const ANONYMOUS_CACHE_CONTROL = 'public, max-age=0, must-revalidate'
export const PERSONALIZED_CACHE_CONTROL = 'private, no-store'

/**
 * Serializes the payload for the inline <script> that ships it to the
 * browser. "<" is JSON-escaped so no string value (username, email) can end
 * the script tag early ("</script>") without changing the decoded value once
 * JSON.parse runs.
 */
export function serializeSsrUser(user) {
  return JSON.stringify(user).replace(/</g, '\\u003c')
}

export function ssrUserScript(user) {
  return `<script>window[${JSON.stringify(SSR_USER_KEY)}]=${serializeSsrUser(user)};</script>`
}

/**
 * Personalized responses are per-user and must never be cached anywhere
 * shared; anonymous renders keep the always-revalidate public caching.
 */
export function cacheControlFor(user) {
  return user ? PERSONALIZED_CACHE_CONTROL : ANONYMOUS_CACHE_CONTROL
}

/**
 * Injects the rendered app into the template and, when a validated user was
 * rendered, appends the one-shot `window[SSR_USER_KEY]` inline script right
 * after the root element. A classic inline script runs during HTML parsing,
 * i.e. before the deferred module bundle, so the payload is always in place
 * before the client tree's first render.
 */
export function composeRenderedHtml({ template, appHtml, user }) {
  return template.replace(
    '<div id="root"></div>',
    '<div id="root">' + appHtml + '</div>' + (user ? ssrUserScript(user) : ''),
  )
}

/**
 * Session validation is best-effort: any failure (plain anonymous request,
 * invalid token, cold/unreachable database, unexpected error) degrades to
 * the anonymous shell instead of failing the request.
 */
async function resolveSsrUser(getSessionUserFromHeaders, req) {
  try {
    return await getSessionUserFromHeaders(req?.headers || {})
  } catch (error) {
    console.error(
      '[SSR] Session validation failed, rendering the anonymous shell:',
      error?.message || error,
    )
    return null
  }
}

function sendDiagnostic(res, status, stage, error = null) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({
    ok: status === 200,
    stage,
    error: error ? { name: error.name, code: error.code || null, message: error.message || String(error) } : null,
  }))
}

export default async function handler(req, res) {
  const { url, diagnostic } = getRenderUrl(req)
  const canDiagnose = diagnostic && process.env.VERCEL_ENV === 'preview'
  let stage = 'read-template'
  let template

  try {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
    stage = 'import-session-module'
    const { getSessionUserFromHeaders } = await import('../artifacts/api-server/src/chess-server/ssrSession.js')
    stage = 'import-renderer-module'
    const { render } = await import('../artifacts/chess/dist/server/entry-server.js')
    stage = 'resolve-session'
    const ssrUser = await resolveSsrUser(getSessionUserFromHeaders, req)
    stage = 'render-route'
    const appHtml = await render(url, { user: ssrUser })

    if (canDiagnose) {
      return sendDiagnostic(res, 200, 'complete')
    }

    const html = composeRenderedHtml({ template, appHtml, user: ssrUser })
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', cacheControlFor(ssrUser))
    res.end(html)
  } catch (error) {
    console.error(`[SSR] Request failed during ${stage}:`, error)
    if (canDiagnose) {
      return sendDiagnostic(res, 500, stage, error)
    }
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(template || '')
  }
}
