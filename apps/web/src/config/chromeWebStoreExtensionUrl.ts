const CHROME_WEB_STORE_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com'])

/**
 * Optional public Chrome Web Store listing URL for the RiffSync Host extension.
 * Only https URLs on official store hosts are accepted; otherwise undefined.
 */
export function getChromeWebStoreExtensionUrl(): string | undefined {
  const raw = import.meta.env.VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL?.trim()
  if (!raw) {
    return undefined
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') {
      return undefined
    }
    if (!CHROME_WEB_STORE_HOSTS.has(url.hostname)) {
      return undefined
    }
    return url.href
  } catch {
    return undefined
  }
}
