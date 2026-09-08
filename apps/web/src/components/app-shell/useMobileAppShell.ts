import { useEffect, useState } from 'react'

export const APP_SHELL_MOBILE_MEDIA_QUERY = '(max-width: 767px)'

export function useMobileAppShell(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false
    }
    return window.matchMedia(APP_SHELL_MOBILE_MEDIA_QUERY).matches
  })

  useEffect(() => {
    const query = window.matchMedia(APP_SHELL_MOBILE_MEDIA_QUERY)
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return isMobile
}
