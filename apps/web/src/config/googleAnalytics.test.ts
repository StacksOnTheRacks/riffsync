// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getGaMeasurementId,
  initGoogleAnalytics,
  resetGoogleAnalyticsInitForTests,
  trackGaPageView,
} from './googleAnalytics'

describe('googleAnalytics', () => {
  beforeEach(() => {
    resetGoogleAnalyticsInitForTests()
    document.head.innerHTML = ''
    delete window.gtag
    delete window.dataLayer
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    resetGoogleAnalyticsInitForTests()
    document.head.innerHTML = ''
    delete window.gtag
    delete window.dataLayer
  })

  it('returns null when VITE_GA_MEASUREMENT_ID is unset', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
    expect(getGaMeasurementId()).toBeNull()
  })

  it('returns trimmed measurement id when configured', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '  G-TEST123  ')
    expect(getGaMeasurementId()).toBe('G-TEST123')
  })

  it('bootstraps gtag from bundled code and loads the external library script', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')

    const appendedScripts: HTMLScriptElement[] = []
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement && node.dataset.riffsyncGtag === 'true') {
        appendedScripts.push(node)
        node.dispatchEvent(new Event('load'))
        return node
      }
      return HTMLHeadElement.prototype.appendChild.call(document.head, node)
    })

    await initGoogleAnalytics()

    expect(typeof window.gtag).toBe('function')

    const jsEntry = window.dataLayer?.find(
      (entry): entry is unknown[] => Array.isArray(entry) && entry[0] === 'js',
    )
    expect(jsEntry?.[1]).toBeInstanceOf(Date)

    const configEntry = window.dataLayer?.find(
      (entry): entry is unknown[] =>
        Array.isArray(entry) && entry[0] === 'config' && entry[1] === 'G-TEST123',
    )
    expect(configEntry).toBeDefined()

    expect(appendedScripts).toHaveLength(1)
    expect(appendedScripts[0]?.src).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-TEST123',
    )
  })

  it('tracks page views through gtag when configured', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
    const gtag = vi.fn()
    window.gtag = gtag

    trackGaPageView('/catalog?genre=sci-fi')

    expect(gtag).toHaveBeenCalledWith('config', 'G-TEST123', {
      page_path: '/catalog?genre=sci-fi',
    })
  })

  it('no-ops when gtag is unavailable', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
    expect(() => trackGaPageView('/')).not.toThrow()
  })
})
