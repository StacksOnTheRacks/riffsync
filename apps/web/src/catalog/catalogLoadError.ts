export const CATALOG_UNAVAILABLE_HEADING = 'Catalog unavailable'

export const CATALOG_UNAVAILABLE_MESSAGE =
  'We could not load the episode catalog right now. Check your connection and try again.'

export const EPISODE_UNAVAILABLE_MESSAGE =
  'We could not load this episode right now. Check your connection and try again.'

export class CatalogLoadError extends Error {
  readonly userMessage: string

  constructor(userMessage: string, options?: { cause?: unknown; devDetail?: string }) {
    super(options?.devDetail ?? userMessage)
    this.name = 'CatalogLoadError'
    this.userMessage = userMessage
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

function isNetworkFetchFailure(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return (
    normalized === 'failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed') ||
    normalized.includes('load failed')
  )
}

function isInternalCatalogMessage(message: string): boolean {
  return (
    message.includes('VITE_PUBLIC_API_BASE_URL') ||
    message.includes('.env.development') ||
    /^Catalog (request|carousel request|item request) failed \(\d+\)$/.test(message) ||
    message.startsWith('Catalog response missing') ||
    message.startsWith('Catalog carousel response missing') ||
    message.startsWith('Catalog item response missing') ||
    message.startsWith('Catalog episode ')
  )
}

export function formatCatalogUserError(
  error: unknown,
  fallback = CATALOG_UNAVAILABLE_MESSAGE,
): string {
  if (error instanceof CatalogLoadError) {
    return error.userMessage
  }
  if (error instanceof Error) {
    if (isNetworkFetchFailure(error.message) || isInternalCatalogMessage(error.message)) {
      return fallback
    }
  }
  return fallback
}

export function logCatalogLoadError(scope: string, error: unknown): void {
  if (!import.meta.env.DEV) return
  if (error instanceof CatalogLoadError) {
    console.error(`[catalog] ${scope}`, error.message, error.cause ?? '')
    return
  }
  console.error(`[catalog] ${scope}`, error)
}
