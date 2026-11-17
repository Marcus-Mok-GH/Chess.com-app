import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { rememberPostLoginPath } from '../utils/postLoginPath'

/**
 * Route-level auth gate for pages that only make sense with an account.
 *
 * Guests are redirected to /login instead of being shown an inline
 * "account required" card, and the page they asked for is remembered so a
 * successful sign-in lands them back on it. While the session is still
 * resolving (`isLoading`) the supplied fallback renders: a returning user must
 * never be bounced to /login before their cookie has been read.
 *
 * @param {object} props
 * @param {JSX.Element} props.children The protected page.
 * @param {JSX.Element|null} [props.fallback] Rendered while loading.
 * @returns {JSX.Element}
 */
export default function RequireAuth({ children, fallback = null }) {
  const { isLoggedIn, isLoading } = useUser()
  const location = useLocation()
  const shouldRedirect = !isLoading && !isLoggedIn

  // Kept in an effect (not the render body) so the redirect stays a pure
  // function of router state and storage writes never happen during render.
  useEffect(() => {
    if (!shouldRedirect) return
    rememberPostLoginPath(`${location.pathname}${location.search}`)
  }, [shouldRedirect, location.pathname, location.search])

  if (isLoading) return fallback
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return children
}
