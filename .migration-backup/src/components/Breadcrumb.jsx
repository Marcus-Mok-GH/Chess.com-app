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
  
  const currentPath = location.pathname.startsWith('/online/') ? '/online' : location.pathname
  
  const getBreadcrumbs = () => {
    const crumbs = []
    
    // Always start with home
    if (currentPath !== '/') {
      crumbs.push(breadcrumbMap['/'])
    }
    
    // Add current page if not home
    if (currentPath !== '/' && breadcrumbMap[currentPath]) {
      crumbs.push(breadcrumbMap[currentPath])
    }
    
    // Special case for online game rooms
    if (location.pathname.startsWith('/online/')) {
      const gameId = location.pathname.split('/')[2]
      if (gameId) {
        crumbs.push({
          title: `Game ${gameId.slice(0, 8)}...`,
          path: location.pathname
        })
      }
    }
    
    return crumbs
  }

  const breadcrumbs = getBreadcrumbs()
  
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
