// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGaMeasurementId, trackGaPageView } from './googleAnalytics'

describe('googleAnalytics', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete window.gtag
  })

  it('returns null when VITE_GA_MEASUREMENT_ID is unset', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
    expect(getGaMeasurementId()).toBeNull()
  })

  it('returns trimmed measurement id when configured', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '  G-TEST123  ')
    expect(getGaMeasurementId()).toBe('G-TEST123')
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
