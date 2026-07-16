import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackGaPageView } from '../config/googleAnalytics'

/** Report client-side route changes to GA4 after the initial gtag bootstrap in index.html. */
export function GoogleAnalytics() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    trackGaPageView(`${pathname}${search}`)
  }, [pathname, search])

  return null
}
