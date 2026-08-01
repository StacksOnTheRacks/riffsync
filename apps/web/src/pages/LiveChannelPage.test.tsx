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
const useLiveChannelChat = vi.fn()

vi.mock('../api/liveApi', () => ({
  fetchLiveChannel: (...args: unknown[]) => fetchLiveChannel(...args),
}))

vi.mock('../live/useLiveChannelChat', () => ({
  useLiveChannelChat: (...args: unknown[]) => useLiveChannelChat(...args),
}))

vi.mock('../auth/useFanSession', () => ({
  useFanSession: () => ({ fanToken: null }),
}))

vi.mock('../components/watch/SoloYouTubePlayer', () => ({
  SoloYouTubePlayer: ({ videoId }: { videoId: string }) => (
    <div data-testid="yt-player">{videoId}</div>
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
    fetchLiveChannel.mockReset()
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
    expect(container.textContent).toContain('2 watching')
    expect(container.textContent).toContain('Sign In to Chat')
  })

  it('shows unavailable copy for unknown slug', async () => {
    await act(async () => {
      renderLive(root, '/live/not-a-channel', queryClient)
    })

    expect(fetchLiveChannel).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Live channel not found')
  })
})
