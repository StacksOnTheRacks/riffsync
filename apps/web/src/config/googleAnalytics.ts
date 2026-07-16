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
 * gtag.js only treats queued commands as hits when they are Arguments objects
 * (or objects with a `callee` property). Rest-parameter arrays look identical in
 * the console but produce no `/g/collect` network requests.
 *
 * Prefer native `arguments`. If a bundler rewrites that away, fall back to an
 * Arguments-like object with `callee` so Google's type check still passes.
 */
function queueGtagCommand(gtagFn: (...args: unknown[]) => void, args: IArguments | unknown[]): void {
  const isNativeArguments =
    Object.prototype.toString.call(args) === '[object Arguments]' ||
    Object.prototype.hasOwnProperty.call(args, 'callee')

  if (isNativeArguments) {
    window.dataLayer!.push(args as unknown as unknown[])
    return
  }

  const command: Record<number | string, unknown> = {
    length: args.length,
    callee: gtagFn,
  }
  for (let i = 0; i < args.length; i += 1) {
    command[i] = args[i]
  }
  window.dataLayer!.push(command)
}

function installGtagStub(): void {
  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag(this: unknown) {
    queueGtagCommand(gtag, arguments)
  }
}

function findDataLayerCommand(command: string): Record<number, unknown> | undefined {
  return window.dataLayer?.find((entry) => {
    if (entry == null || typeof entry !== 'object') {
      return false
    }
    return (entry as Record<number, unknown>)[0] === command
  }) as Record<number, unknown> | undefined
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
    installGtagStub()
    window.gtag!('js', new Date())
    window.gtag!('config', measurementId)

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

/** @internal Test helper for queued gtag commands. */
export function findQueuedGtagCommandForTests(command: string): Record<number, unknown> | undefined {
  return findDataLayerCommand(command)
}

/** @internal Test helper for dataLayer entry shape. */
export function isArgumentsLikeForTests(entry: unknown): boolean {
  if (entry == null || typeof entry !== 'object') {
    return false
  }
  return (
    Object.prototype.toString.call(entry) === '[object Arguments]' ||
    Object.prototype.hasOwnProperty.call(entry, 'callee')
  )
}
