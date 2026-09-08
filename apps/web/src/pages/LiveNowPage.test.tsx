// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveNowPage } from './LiveNowPage'

const fetchLiveChannels = vi.fn()
const fetchLiveChannel = vi.fn()

vi.mock('../api/liveApi', () => ({
  fetchLiveChannels: (...args: unknown[]) => fetchLiveChannels(...args),
  fetchLiveChannel: (...args: unknown[]) => fetchLiveChannel(...args),
}))

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.test',
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const liveChannelFixture = {
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
  playbackHost: 'youtube' as const,
}

describe('LiveNowPage', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    fetchLiveChannels.mockReset()
    fetchLiveChannel.mockReset()
    fetchLiveChannels.mockResolvedValue({
      version: 1,
      channels: [liveChannelFixture],
    })
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LiveNowPage />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
  }

  function clickViewToggle(label: 'Cards' | 'List') {
    const button = Array.from(container.querySelectorAll('.riffsync-view-toggle__button')).find(
      (node) => node.getAttribute('aria-label') === label,
    )
    expect(button).toBeTruthy()
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('lists enabled live channels from GET /v1/live and links to /live/{slug}', async () => {
    renderPage()
    await vi.waitFor(() => {
      expect(container.textContent).toContain('MST3K Forever-A-Thon')
    })

    expect(fetchLiveChannels).toHaveBeenCalled()
    expect(fetchLiveChannel).not.toHaveBeenCalled()
    expect(container.querySelector('h1.sr-only')?.textContent).toBe('Live Now')
    expect(container.querySelector('.riffsync-channel-hero__visual-title')?.textContent).toBe('Live Now')

    const link = container.querySelector('a[href="/live/mst3k-forever-a-thon"]')
    expect(link).not.toBeNull()
    expect(container.querySelector('button.gen-button')).toBeNull()
  })

  it('defaults to Cards view with aria-pressed on ViewToggle', async () => {
    renderPage()
    await vi.waitFor(() => {
      expect(container.querySelector('[aria-label="Cards"]')).not.toBeNull()
    })

    expect(container.querySelector('[aria-label="Cards"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.riffsync-live-now-card-grid')).not.toBeNull()
    expect(container.querySelector('.riffsync-live-now-list')).toBeNull()
  })

  it('shows the same channels in Cards and List views', async () => {
    renderPage()
    await vi.waitFor(() => {
      expect(container.textContent).toContain('MST3K Forever-A-Thon')
    })

    clickViewToggle('List')
    expect(container.querySelector('.riffsync-live-now-list')).not.toBeNull()
    expect(container.textContent).toContain('MST3K Forever-A-Thon')
  })

  it('uses non-catalog empty copy when no enabled channels exist', async () => {
    fetchLiveChannels.mockResolvedValue({
      version: 1,
      channels: [{ ...liveChannelFixture, enabled: false }],
    })

    renderPage()
    await vi.waitFor(() => {
      expect(container.textContent).toContain('No live channels right now.')
    })

    expect(container.textContent).not.toContain('No episodes in the catalog yet.')
  })

  it('announces live fetch errors to assistive tech', async () => {
    fetchLiveChannels.mockRejectedValue(new Error('Live channels unavailable'))

    renderPage()
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull()
    })

    expect(container.textContent).toContain('Live channels unavailable')
  })

  it('stacks live rows at max-width 767px', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const matches = query === '(max-width: 767px)'
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      } as MediaQueryList
    })

    renderPage()
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-live-now-card-grid')).not.toBeNull()
    })
  })
})
