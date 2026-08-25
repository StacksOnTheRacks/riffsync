// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findQueuedGtagCommandForTests,
  getGaMeasurementId,
  initGoogleAnalytics,
  isArgumentsLikeForTests,
  resetGoogleAnalyticsInitForTests,
  trackGaEvent,
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

  it('bootstraps gtag with Arguments-like commands and loads the library script', async () => {
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
    expect(window.dataLayer?.length).toBeGreaterThan(0)
    for (const entry of window.dataLayer ?? []) {
      expect(isArgumentsLikeForTests(entry)).toBe(true)
    }

    const jsEntry = findQueuedGtagCommandForTests('js')
    expect(jsEntry?.[1]).toBeInstanceOf(Date)

    const configEntry = findQueuedGtagCommandForTests('config')
    expect(configEntry?.[1]).toBe('G-TEST123')

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

  it('no-ops trackGaEvent when measurement id is unset', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
    const gtag = vi.fn()
    window.gtag = gtag
    trackGaEvent('room_join', { entry_surface: 'lobby', is_authenticated: false })
    expect(gtag).not.toHaveBeenCalled()
  })

  it('no-ops trackGaEvent when gtag is unavailable', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
    expect(() =>
      trackGaEvent('solo_watch_start', {
        catalog_category: 'mst3k',
        playback_host: 'youtube',
        is_authenticated: true,
      }),
    ).not.toThrow()
  })

  it('tracks custom funnel events through gtag with allowlisted params only', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
    const gtag = vi.fn()
    window.gtag = gtag

    trackGaEvent('host_room_create', {
      catalog_category: 'mst3k',
      playback_host: 'youtube',
      is_authenticated: true,
      entry_surface: 'catalog',
      source: 'catalog_episode',
    })

    expect(gtag).toHaveBeenCalledWith('event', 'host_room_create', {
      catalog_category: 'mst3k',
      playback_host: 'youtube',
      is_authenticated: true,
      entry_surface: 'catalog',
      source: 'catalog_episode',
    })
    const payload = gtag.mock.calls[0]?.[2] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('roomId')
    expect(Object.keys(payload)).not.toContain('sessionId')
  })
})
