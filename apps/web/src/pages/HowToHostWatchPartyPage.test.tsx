// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HowToHostWatchPartyPage } from './HowToHostWatchPartyPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const VALID_LISTING =
  'https://chromewebstore.google.com/detail/riffsync-host/abcdefghijklmnopqrstuvwxyz'

describe('HowToHostWatchPartyPage host-extension section', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllEnvs()
  })

  function renderPage() {
    act(() => {
      root.render(<HowToHostWatchPartyPage />)
    })
  }

  it('shows Add to Chrome store link when listing URL is configured', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', VALID_LISTING)
    renderPage()

    expect(container.querySelector('#host-extension')?.textContent).toBe('Install the Host extension')
    expect(container.textContent).toContain('RiffSync Host')
    expect(container.textContent).toContain('Chrome Web Store')
    expect(container.textContent).not.toContain('Developer mode')
    expect(container.textContent).not.toContain('Load unpacked')

    const link = container.querySelector('a.gen-button')
    expect(link?.textContent).toBe('Add to Chrome')
    expect(link?.getAttribute('href')).toBe(VALID_LISTING)
    expect(link?.getAttribute('target')).toBe('_blank')
    const rel = link?.getAttribute('rel') ?? ''
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
  })

  it('shows preparatory copy with no store link when env is unset', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', '')
    renderPage()

    expect(container.querySelector('#host-extension')).not.toBeNull()
    expect(container.textContent).toContain('RiffSync Host')
    expect(container.querySelector('a.gen-button')).toBeNull()
    expect(container.textContent).not.toContain('Load unpacked')
    expect(container.textContent).not.toContain('Developer mode')
    expect(container.textContent).not.toMatch(/no Chrome Web Store listing/i)
  })

  it('shows preparatory copy with no store link when URL is invalid', () => {
    vi.stubEnv('VITE_PUBLIC_CHROME_WEB_STORE_EXTENSION_URL', 'https://evil.example.com/bad')
    renderPage()

    expect(container.querySelector('#host-extension')).not.toBeNull()
    expect(container.querySelector('a.gen-button')).toBeNull()
    expect(container.textContent).not.toMatch(/no Chrome Web Store listing/i)
  })
})
