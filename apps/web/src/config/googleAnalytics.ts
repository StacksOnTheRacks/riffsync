/** Public GA4 measurement id baked at build time (`VITE_GA_MEASUREMENT_ID`). */
export function getGaMeasurementId(): string | null {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID
  if (typeof id !== 'string') {
    return null
  }
  const trimmed = id.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Send a SPA page view when gtag is present (initial load is handled in index.html). */
export function trackGaPageView(pagePath: string): void {
  const measurementId = getGaMeasurementId()
  if (!measurementId || typeof window.gtag !== 'function') {
    return
  }
  window.gtag('config', measurementId, {
    page_path: pagePath,
  })
}
