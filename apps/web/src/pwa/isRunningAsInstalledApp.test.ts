// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRunningAsInstalledApp } from './isRunningAsInstalledApp'

interface StandaloneNavigator extends Navigator {
  standalone?: boolean
}

const originalMatchMedia = window.matchMedia
const originalStandalone = (navigator as StandaloneNavigator).standalone

function stubDisplayMode(activeMode: 'standalone' | 'minimal-ui' | null) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: activeMode ? query === `(display-mode: ${activeMode})` : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function setIosStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    value: originalStandalone,
  })
})

describe('isRunningAsInstalledApp', () => {
  it('detects standalone display mode', () => {
    stubDisplayMode('standalone')
    setIosStandalone(false)

    expect(isRunningAsInstalledApp()).toBe(true)
  })

  it('detects minimal-ui display mode', () => {
    stubDisplayMode('minimal-ui')
    setIosStandalone(false)

    expect(isRunningAsInstalledApp()).toBe(true)
  })

  it('detects iOS standalone mode', () => {
    stubDisplayMode(null)
    setIosStandalone(true)

    expect(isRunningAsInstalledApp()).toBe(true)
  })

  it('returns false in a normal browser tab', () => {
    stubDisplayMode(null)
    setIosStandalone(false)

    expect(isRunningAsInstalledApp()).toBe(false)
  })
})
