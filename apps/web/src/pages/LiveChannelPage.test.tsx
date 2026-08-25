// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import { LiveChannelPage } from './LiveChannelPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const fetchLiveChannel = vi.fn()
const fetchFanProfile = vi.fn()
const useLiveChannelChat = vi.fn()
const useFanSession = vi.fn()
const setGuestDisplayName = vi.fn<(displayName: string) => string>()
const trackGaEvent = vi.fn()

vi.mock('../config/googleAnalytics', () => ({
  trackGaEvent: (...args: unknown[]) => trackGaEvent(...args),
}))

vi.mock('../api/liveApi', () => ({
  fetchLiveChannel: (...args: unknown[]) => fetchLiveChannel(...args),
}))

vi.mock('../api/fanProfileApi', () => ({
  fetchFanProfile: (...args: unknown[]) => fetchFanProfile(...args),
}))

vi.mock('../live/useLiveChannelChat', () => ({
  useLiveChannelChat: (...args: unknown[]) => useLiveChannelChat(...args),
}))

vi.mock('../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../session/guestSession', () => ({
  ensureGuestSession: () => ({ sessionId: 'live-session-1', displayName: 'RandomCrow123' }),
  setGuestDisplayName: (displayName: string) => setGuestDisplayName(displayName),
}))

const youtubePlayerFail = vi.hoisted(() => ({ value: false }))

vi.mock('../components/watch/SoloYouTubePlayer', () => ({
  SoloYouTubePlayer: ({
    videoId,
    watchUrl,
  }: {
    videoId: string
    watchUrl?: string | null
  }) =>
    youtubePlayerFail.value ? (
      <div className="riffsync-solo-player" data-testid="yt-player-error">
        <div className="riffsync-solo-player__chrome" aria-live="polite">
          <p role="alert">
            This video link is broken.
            {watchUrl ? (
              <>
                {' '}
                <a href={watchUrl} rel="noreferrer" target="_blank">
                  Open on YouTube
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>
    ) : (
      <div data-testid="yt-player" data-watch-url={watchUrl ?? ''}>
        {videoId}
      </div>
    ),
}))

vi.mock('../room/ChatComposeMediaPicker', () => ({
  ChatComposeMediaPicker: () => null,
}))

function renderLive(root: Root, path: string, queryClient: QueryClient) {
  root.render(
    <QueryClientProvider client={queryClient}>
      <RoomChromeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/live/:slug" element={<LiveChannelPage />} />
          </Routes>
        </MemoryRouter>
      </RoomChromeProvider>
    </QueryClientProvider>,
  )
}

describe('LiveChannelPage', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    youtubePlayerFail.value = false
    fetchLiveChannel.mockReset()
    fetchFanProfile.mockReset()
    useFanSession.mockReset()
    useFanSession.mockReturnValue({ fanToken: null })
    setGuestDisplayName.mockReset()
    setGuestDisplayName.mockImplementation((displayName: string) => displayName)
    trackGaEvent.mockReset()
    useLiveChannelChat.mockReturnValue({
      wsStatus: 'open',
      chat: [],
      chatReactions: {},
      chatDraft: '',
      setChatDraft: vi.fn(),
      onComposeBlur: vi.fn(),
      sendChat: vi.fn(),
      sendChatGif: vi.fn(),
      toggleChatReaction: vi.fn(),
      chatMemberLabels: new Map(),
      remoteTyping: [],
      presenceCount: 2,
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    queryClient.clear()
    container.remove()
  })

  it('renders YouTube player and chat chrome for a resolved channel', async () => {
    fetchLiveChannel.mockResolvedValue({
      slug: 'mst3k-forever-a-thon',
      path: '/live/mst3k-forever-a-thon',
      roomId: 'live-mst3k-forever-a-thon',
      catalogEpisodeId: 'mst3k-forever-a-thon',
      enabled: true,
      title: 'MST3K Forever-A-Thon',
      tagline: '24/7',
      posterImageUrl: null,
      backdropImageUrl: null,
      youtubeVideoId: 'abcdefghijk',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      embedAllows: true,
      playbackHost: 'youtube',
    })

    await act(async () => {
      renderLive(root, '/live/mst3k-forever-a-thon', queryClient)
    })

    await vi.waitFor(() => {
      expect(fetchLiveChannel).toHaveBeenCalledWith('mst3k-forever-a-thon')
      expect(container.querySelector('[data-testid="yt-player"]')?.textContent).toBe('abcdefghijk')
    })
    expect(container.textContent).toContain('MST3K Forever-A-Thon')
    expect(container.textContent).toContain('People (2)')
    expect(container.textContent).not.toContain('Room')
    expect(container.textContent).toContain('Sign In to Chat')
    expect(container.querySelector('.riffsync-live-page__chat .riffsync-room-page__chat')).not.toBeNull()
  })

  it('tracks live_channel_view once when channel layout renders', async () => {
    fetchLiveChannel.mockResolvedValue({
      slug: 'mst3k-forever-a-thon',
      path: '/live/mst3k-forever-a-thon',
      roomId: 'live-mst3k-forever-a-thon',
      catalogEpisodeId: 'mst3k-forever-a-thon',
      enabled: true,
      title: 'MST3K Forever-A-Thon',
      tagline: '24/7',
      posterImageUrl: null,
      backdropImageUrl: null,
      youtubeVideoId: 'abcdefghijk',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      embedAllows: true,
      playbackHost: 'youtube',
    })

    await act(async () => {
      renderLive(root, '/live/mst3k-forever-a-thon', queryClient)
    })

    await vi.waitFor(() => {
      expect(trackGaEvent).toHaveBeenCalledWith('live_channel_view', {
        is_authenticated: false,
        entry_surface: 'live',
        source: 'direct',
      })
    })
    expect(trackGaEvent).toHaveBeenCalledTimes(1)
    const payload = trackGaEvent.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('roomId')
  })

  it('hydrates signed-in fan display name before sending live chat identity', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchFanProfile.mockResolvedValue({
      displayName: 'Derrick Anderson',
      updatedAt: 1,
      avatarUrl: 'https://cdn.test/avatar.png',
      avatarUpdatedAt: 1,
    })
    fetchLiveChannel.mockResolvedValue({
      slug: 'mst3k-forever-a-thon',
      path: '/live/mst3k-forever-a-thon',
      roomId: 'live-mst3k-forever-a-thon',
      catalogEpisodeId: 'mst3k-forever-a-thon',
      enabled: true,
      title: 'MST3K Forever-A-Thon',
      tagline: '24/7',
      posterImageUrl: null,
      backdropImageUrl: null,
      youtubeVideoId: 'abcdefghijk',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      embedAllows: true,
      playbackHost: 'youtube',
    })

    await act(async () => {
      renderLive(root, '/live/mst3k-forever-a-thon', queryClient)
    })

    await vi.waitFor(() => {
      expect(fetchFanProfile).toHaveBeenCalledWith('fan-token')
      expect(useLiveChannelChat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          roomId: 'live-mst3k-forever-a-thon',
          sessionId: 'live-session-1',
          displayName: 'Derrick Anderson',
          fanToken: 'fan-token',
        }),
      )
    })
  })

  it('shows unavailable copy for unknown slug', async () => {
    fetchLiveChannel.mockRejectedValue(new Error('Live channel not found'))

    await act(async () => {
      renderLive(root, '/live/not-a-channel', queryClient)
    })

    await vi.waitFor(() => {
      expect(fetchLiveChannel).toHaveBeenCalledWith('not-a-channel')
      expect(container.textContent).toContain('Live channel not found')
    })
  })

  it('keeps chat chrome when the YouTube embed reports a broken link', async () => {
    youtubePlayerFail.value = true
    fetchLiveChannel.mockResolvedValue({
      slug: 'mst3k-forever-a-thon',
      path: '/live/mst3k-forever-a-thon',
      roomId: 'live-mst3k-forever-a-thon',
      catalogEpisodeId: 'mst3k-forever-a-thon',
      enabled: true,
      title: 'MST3K Forever-A-Thon',
      tagline: '24/7',
      posterImageUrl: null,
      backdropImageUrl: null,
      youtubeVideoId: 'retiredLiveId',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=retiredLiveId',
      embedAllows: true,
      playbackHost: 'youtube',
    })

    await act(async () => {
      renderLive(root, '/live/mst3k-forever-a-thon', queryClient)
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="yt-player-error"]')).not.toBeNull()
    })

    expect(container.textContent).toContain('This video link is broken.')
    expect(
      container.querySelector('a[href="https://www.youtube.com/watch?v=retiredLiveId"]')?.textContent,
    ).toBe('Open on YouTube')
    expect(container.textContent).toContain('People (2)')
    expect(container.textContent).toContain('Sign In to Chat')
    expect(container.querySelector('.riffsync-live-page__chat .riffsync-room-page__chat')).not.toBeNull()
    expect(container.querySelector('.riffsync-live-page__layout')).not.toBeNull()
  })
})
