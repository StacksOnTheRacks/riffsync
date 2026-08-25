// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { getFanAccessToken } from '../../auth/fanTokens'
import { EpisodeTileActions } from './EpisodeTileActions'

vi.mock('../../auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => null),
}))

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: vi.fn(),
}))

const trackGaEvent = vi.fn()

vi.mock('../../config/googleAnalytics', () => ({
  trackGaEvent: (...args: unknown[]) => trackGaEvent(...args),
}))

const createRoom = vi.fn()

vi.mock('../../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/roomsApi')>()
  return {
    ...actual,
    createRoom: (...args: unknown[]) => createRoom(...args),
  }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function episode(overrides: Partial<CatalogEpisode> = {}): CatalogEpisode {
  return {
    id: '032-mitchell',
    experimentNumber: 32,
    title: 'Mitchell',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'NXGXtm6gcxk',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  }
}

describe('EpisodeTileActions', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.spyOn(window, 'open').mockReturnValue(null)
    trackGaEvent.mockReset()
    createRoom.mockReset()
    vi.mocked(getFanAccessToken).mockReturnValue(null)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderActions(ep: CatalogEpisode) {
    act(() => {
      root.render(
        <MemoryRouter>
          <EpisodeTileActions episode={ep} />
        </MemoryRouter>,
      )
    })
  }

  it('opens YouTube in a new tab for Watch Solo when embedAllows is false', () => {
    renderActions(episode({ embedAllows: false }))

    const watchSolo = container.querySelector('button.gen-button--ghost') as HTMLButtonElement | null
    expect(watchSolo).not.toBeNull()
    expect(watchSolo?.disabled).toBe(false)
    expect(container.querySelector('a.gen-button--ghost')).toBeNull()

    act(() => {
      watchSolo?.click()
    })

    expect(window.open).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=NXGXtm6gcxk',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('links Watch Solo to /watch/:id for embeddable YouTube rows', () => {
    renderActions(episode({ embedAllows: true }))

    const watchSolo = container.querySelector('a.gen-button--ghost') as HTMLAnchorElement | null
    expect(watchSolo?.getAttribute('href')).toBe('/watch/032-mitchell')
    expect(container.querySelector('button.gen-button--ghost')).toBeNull()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('enables both actions for Custom-host rows with HTTPS customPlaybackUrl', () => {
    renderActions(
      episode({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/movie',
        youtubeVideoId: null,
      }),
    )

    const watchSolo = container.querySelector('a.gen-button--ghost') as HTMLAnchorElement | null
    expect(watchSolo?.getAttribute('href')).toBe('/watch/032-mitchell')
    const startParty = container.querySelector('button.gen-button:not(.gen-button--ghost)') as HTMLButtonElement
    expect(startParty.disabled).toBe(false)
  })

  it('disables both actions when Custom-host row has no valid customPlaybackUrl', () => {
    renderActions(
      episode({
        playbackHost: 'custom',
        customPlaybackUrl: null,
        youtubeVideoId: 'NXGXtm6gcxk',
      }),
    )

    const watchSolo = container.querySelector('button.gen-button--ghost') as HTMLButtonElement
    const startParty = container.querySelector('button.gen-button:not(.gen-button--ghost)') as HTMLButtonElement
    expect(watchSolo.disabled).toBe(true)
    expect(startParty.disabled).toBe(true)
    expect(container.querySelector('a.gen-button--ghost')).toBeNull()
  })

  it('disables both actions when YouTube-host row has no video id', () => {
    renderActions(episode({ youtubeVideoId: null, youtubeWatchUrl: null }))

    const watchSolo = container.querySelector('button.gen-button--ghost') as HTMLButtonElement
    const startParty = container.querySelector('button.gen-button:not(.gen-button--ghost)') as HTMLButtonElement
    expect(watchSolo.disabled).toBe(true)
    expect(startParty.disabled).toBe(true)
  })

  it('tracks host_room_create after signed-in Start Party succeeds', async () => {
    vi.mocked(getFanAccessToken).mockReturnValue('fan-token')
    createRoom.mockResolvedValue({ roomId: 'room-new-1' })

    renderActions(episode({ embedAllows: true }))

    const startParty = container.querySelector('button.gen-button:not(.gen-button--ghost)') as HTMLButtonElement
    await act(async () => {
      startParty.click()
    })

    await vi.waitFor(() => {
      expect(createRoom).toHaveBeenCalled()
      expect(trackGaEvent).toHaveBeenCalledWith('host_room_create', {
        catalog_category: 'mst3k',
        playback_host: 'youtube',
        is_authenticated: true,
        entry_surface: 'catalog',
        source: 'catalog_episode',
      })
    })
    const payload = trackGaEvent.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('roomId')
  })
})
