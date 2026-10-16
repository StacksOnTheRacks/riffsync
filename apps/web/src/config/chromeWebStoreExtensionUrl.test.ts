import { afterEach, describe, expect, it, vi } from 'vitest'
import { getChromeWebStoreExtensionUrl } from './chromeWebStoreExtensionUrl'

describe('getChromeWebStoreExtensionUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns undefined when env is unset', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', '')
    expect(getChromeWebStoreExtensionUrl()).toBeUndefined()
  })

  it('returns undefined for blank or whitespace-only values', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', '   ')
    expect(getChromeWebStoreExtensionUrl()).toBeUndefined()
  })

  it('accepts https chromewebstore.google.com URLs', () => {
    const listing = 'https://chromewebstore.google.com/detail/riffsync-host/abcdefghijklmnop'
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', listing)
    expect(getChromeWebStoreExtensionUrl()).toBe(listing)
  })

  it('accepts https chrome.google.com URLs', () => {
    const listing = 'https://chrome.google.com/webstore/detail/riffsync-host/abcdefghijklmnop'
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', listing)
    expect(getChromeWebStoreExtensionUrl()).toBe(listing)
  })

  it('trims surrounding whitespace before validation', () => {
    const listing = 'https://chromewebstore.google.com/detail/riffsync-host/abc'
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', `  ${listing}  `)
    expect(getChromeWebStoreExtensionUrl()).toBe(listing)
  })

  it('rejects http URLs', () => {
    vi.stubEnv(
      'VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL',
      'http://chromewebstore.google.com/detail/riffsync-host/abc',
    )
    expect(getChromeWebStoreExtensionUrl()).toBeUndefined()
  })

  it('rejects javascript: URLs', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', 'javascript:alert(1)')
    expect(getChromeWebStoreExtensionUrl()).toBeUndefined()
  })

  it('rejects other hosts', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', 'https://evil.example.com/extension')
    expect(getChromeWebStoreExtensionUrl()).toBeUndefined()
  })

  it('rejects malformed URLs', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', 'not-a-url')
    expect(getChromeWebStoreExtensionUrl()).toBeUndefined()
  })
})
