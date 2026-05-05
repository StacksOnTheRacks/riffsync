import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Match full-page navigations: reset scroll; client routes don’t do this by default. */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}
