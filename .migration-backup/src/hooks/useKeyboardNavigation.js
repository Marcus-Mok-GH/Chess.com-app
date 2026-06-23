import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export function useKeyboardNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleKeyPress = (event) => {
      // Only handle if no input is focused and Alt key is pressed
      if (event.altKey && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
        switch (event.key) {
          case 'h':
            event.preventDefault()
            navigate('/')
            break
          case 'p':
            event.preventDefault()
            navigate('/play')
            break
          case 'o':
            event.preventDefault()
            navigate('/online')
            break
          case 'b':
            event.preventDefault()
            navigate(-1)
            break
          default:
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [navigate])
}

export default useKeyboardNavigation
