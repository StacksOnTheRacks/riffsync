/** Public GA4 measurement id baked at build time (`VITE_GA_MEASUREMENT_ID`). */
export function getGaMeasurementId(): string | null {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID
  if (typeof id !== 'string') {
    return null
  }
  const trimmed = id.trim()
  return trimmed.length > 0 ? trimmed : null
}

let initPromise: Promise<void> | null = null

/** @internal Resets bootstrap state between unit tests. */
export function resetGoogleAnalyticsInitForTests(): void {
  initPromise = null
}

/**
 * Bootstrap GA4 from bundled code (CSP-safe: no inline scripts).
 * Loads gtag.js from Google Tag Manager and queues the initial config call.
 */
export function initGoogleAnalytics(): Promise<void> {
  const measurementId = getGaMeasurementId()
  if (!measurementId) {
    return Promise.resolve()
  }
  if (initPromise) {
    return initPromise
  }

  initPromise = new Promise((resolve) => {
    window.dataLayer = window.dataLayer ?? []
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args)
    }
    window.gtag('js', new Date())
    window.gtag('config', measurementId)

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-riffsync-gtag="true"]',
    )
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.dataset.riffsyncGtag = 'true'
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })

  return initPromise
}

/** Send a SPA page view after gtag bootstrap completes. */
export function trackGaPageView(pagePath: string): void {
  const measurementId = getGaMeasurementId()
  if (!measurementId || typeof window.gtag !== 'function') {
    return
  }
  window.gtag('config', measurementId, {
    page_path: pagePath,
  })
}
