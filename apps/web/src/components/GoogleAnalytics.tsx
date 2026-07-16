import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { initGoogleAnalytics, trackGaPageView } from '../config/googleAnalytics'

/** Bootstrap GA4 and report client-side route changes without inline scripts (CSP-safe). */
export function GoogleAnalytics() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    void initGoogleAnalytics().then(() => {
      trackGaPageView(`${pathname}${search}`)
    })
  }, [pathname, search])

  return null
}
