// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from './catalogTypes'
import { useResumePendingPartyRoom } from './useResumePendingPartyRoom'
import { PENDING_PARTY_EPISODE_KEY } from './pendingPartyStorage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const trackGaEvent = vi.fn()
const createRoom = vi.fn()
const navigate = vi.fn()

vi.mock('../config/googleAnalytics', () => ({
  trackGaEvent: (...args: unknown[]) => trackGaEvent(...args),
}))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    createRoom: (...args: unknown[]) => createRoom(...args),
  }
})

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => 'fan-token'),
}))

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

function Harness({
  episodes,
  onNavigate,
}: {
  episodes: CatalogEpisode[]
  onNavigate: typeof navigate
}) {
  useResumePendingPartyRoom(episodes, onNavigate)
  return null
}

describe('useResumePendingPartyRoom', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    trackGaEvent.mockReset()
    createRoom.mockReset()
    navigate.mockReset()
    sessionStorage.clear()
    createRoom.mockResolvedValue({ roomId: 'room-resumed' })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    sessionStorage.clear()
  })

  it('tracks host_room_create after pending-party resume succeeds', async () => {
    sessionStorage.setItem(PENDING_PARTY_EPISODE_KEY, '032-mitchell')

    await act(async () => {
      root.render(<Harness episodes={[episode()]} onNavigate={navigate} />)
    })

    await vi.waitFor(() => {
      expect(createRoom).toHaveBeenCalled()
      expect(trackGaEvent).toHaveBeenCalledWith('host_room_create', {
        catalog_category: 'mst3k',
        playback_host: 'youtube',
        is_authenticated: true,
        entry_surface: 'catalog',
        source: 'direct',
      })
    })
    const payload = trackGaEvent.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('roomId')
    expect(navigate).toHaveBeenCalledWith('/room/room-resumed', { replace: true })
  })
})
