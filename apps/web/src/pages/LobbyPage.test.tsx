// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LobbyResponse } from '../api/roomsApi'
import { LobbyPage } from './LobbyPage'

const fetchLobby = vi.fn<(sessionId: string) => Promise<LobbyResponse>>()
const fetchLiveChannels = vi.fn()

vi.mock('../api/liveApi', () => ({
  fetchLiveChannels: (...args: unknown[]) => fetchLiveChannels(...args),
}))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    fetchLobby: (sessionId: string) => fetchLobby(sessionId),
  }
})

vi.mock('../session/guestSession', () => ({
  ensureGuestSession: () => ({ sessionId: 'guest-session-1' }),
}))

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.test',
}))

describe('LobbyPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    fetchLobby.mockReset()
    fetchLiveChannels.mockReset()
    fetchLiveChannels.mockResolvedValue({
      version: 1,
      channels: [
        {
          slug: 'mst3k-forever-a-thon',
          path: '/live/mst3k-forever-a-thon',
          roomId: 'live-mst3k-forever-a-thon',
          catalogEpisodeId: 'mst3k-forever-a-thon',
          enabled: true,
          title: 'MST3K Forever-A-Thon',
          tagline: 'Watch the MST3K Forever-A-Thon live on RiffSync with room chat.',
          posterImageUrl: null,
          backdropImageUrl: null,
          youtubeVideoId: 'abcdefghijk',
          youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          embedAllows: true,
          playbackHost: 'youtube',
        },
      ],
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <LobbyPage />
        </MemoryRouter>,
      )
    })
  }

  it('renders Hosted by line below each lobby row title', async () => {
    fetchLobby.mockResolvedValue({
      rooms: [
        {
          roomId: 'room-1',
          catalogEpisodeId: 'ep-1',
          displayTitle: 'Night of the Living Bread',
          hostDisplayName: 'CosmicCrow123',
          playbackExpectation: 'free',
          liveConnectionCount: 2,
          lastActivityAt: Date.now() - 60_000,
        },
      ],
    })

    renderPage()
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Hosted by CosmicCrow123')
    expect(container.textContent).toContain('Night of the Living Bread')
    expect(container.textContent).toContain('Watch parties')
    expect(container.textContent).not.toContain('Likely ad-supported')
  })

  it('renders official live channels above lobby rooms', async () => {
    fetchLobby.mockResolvedValue({ rooms: [] })

    renderPage()
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Live now')
    expect(container.textContent).toContain('Watch parties')
    expect(container.textContent).toContain('MST3K Forever-A-Thon')
    expect(container.querySelector('a[href="/live/mst3k-forever-a-thon"]')?.textContent).toBe(
      'MST3K Forever-A-Thon',
    )
    expect(container.querySelector('.riffsync-lobby-list__live-dot')).not.toBeNull()
  })
})
