import { useNavigate, useLocation } from 'react-router-dom'
import './Breadcrumb.css'

const breadcrumbMap = {
  '/': { title: 'Home', path: '/' },
  '/play': { title: 'vs Computer', path: '/play' },
  '/online': { title: 'Online Play', path: '/online' },
}

export default function Breadcrumb() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pathname } = location
  const currentPath = pathname.startsWith('/online/') ? '/online' : pathname
  const isOnlineGame = pathname.startsWith('/online/')
  const gameId = isOnlineGame ? pathname.split('/')[2] : null

  const breadcrumbs = currentPath === '/'
    ? []
    : [
        breadcrumbMap['/'],
        breadcrumbMap[currentPath],
        gameId && {
          title: `Game ${gameId.slice(0, 8)}...`,
          path: pathname,
        },
      ].filter(Boolean)

  if (breadcrumbs.length <= 1) return null

  return (
    <div className="breadcrumb">
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.path} className="breadcrumb-item">
          {index < breadcrumbs.length - 1 ? (
            <>
              <button
                className="breadcrumb-link"
                onClick={() => navigate(crumb.path)}
              >
                {crumb.title}
              </button>
              <span className="breadcrumb-separator">›</span>
            </>
          ) : (
            <span className="breadcrumb-current">{crumb.title}</span>
          )}
        </span>
      ))}
    </div>
  )
}
