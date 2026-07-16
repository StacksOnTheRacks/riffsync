// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGaMeasurementId, initGoogleAnalytics, trackGaPageView } from './googleAnalytics'

describe('googleAnalytics', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    delete window.gtag
    delete window.dataLayer
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

    await initGoogleAnalytics()

    expect(typeof window.gtag).toBe('function')
    expect(window.dataLayer).toEqual([
      ['js', expect.any(Date)],
      ['config', 'G-TEST123'],
    ])

    const script = document.querySelector('script[data-riffsync-gtag="true"]')
    expect(script).not.toBeNull()
    expect(script?.getAttribute('src')).toBe(
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
