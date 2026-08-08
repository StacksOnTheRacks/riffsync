// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoloWatchPage } from './SoloWatchPage'
import type { CatalogEpisode } from '../catalog/catalogTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useCatalogEpisodeQuery = vi.fn()
const useCatalogListQuery = vi.fn()

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogEpisodeQuery: (...args: unknown[]) => useCatalogEpisodeQuery(...args),
  useCatalogListQuery: (...args: unknown[]) => useCatalogListQuery(...args),
}))

const youtubePlayerFail = vi.hoisted(() => ({ value: false }))

vi.mock('../components/watch/SoloYouTubePlayer', () => ({
  SoloYouTubePlayer: ({
    videoId,
    titleHint,
    watchUrl,
  }: {
    videoId: string
    titleHint: string
    watchUrl?: string | null
  }) =>
    youtubePlayerFail.value ? (
      <div className="riffsync-solo-player" data-testid="solo-youtube-player-error">
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
      <div
        data-testid="solo-youtube-player"
        data-video-id={videoId}
        data-title={titleHint}
        data-watch-url={watchUrl ?? ''}
      />
    ),
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

describe('SoloWatchPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    youtubePlayerFail.value = false
    useCatalogEpisodeQuery.mockReset()
    useCatalogListQuery.mockReset()
    useCatalogListQuery.mockReturnValue({
      data: [episode()],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderWatchPage(path = '/watch/032-mitchell') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/watch/:catalogEpisodeId" element={<SoloWatchPage />} />
          </Routes>
        </MemoryRouter>,
      )
    })
  }

  it('renders Custom-host iframe when playbackHost is custom with HTTPS URL', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.test/movie',
        youtubeVideoId: null,
      }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('https://example.test/movie')
    expect(iframe?.getAttribute('title')).toBe('Mitchell')
    expect(container.querySelector('[data-testid="solo-youtube-player"]')).toBeNull()
  })

  it('shows blocked copy when Custom-host row is missing customPlaybackUrl', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({
        playbackHost: 'custom',
        customPlaybackUrl: null,
        embedAllows: false,
      }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    expect(container.textContent).toContain(
      'Playback unavailable — no custom playback URL is linked for this catalog entry.',
    )
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('does not apply embedAllows gate to Custom-host rows', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.test/movie',
        embedAllows: false,
      }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    expect(container.querySelector('iframe')).not.toBeNull()
    expect(container.textContent).not.toContain('embedAllows')
  })

  it('keeps YouTube-host playback path unchanged', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({ embedAllows: true }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    const youtubePlayer = container.querySelector('[data-testid="solo-youtube-player"]')
    expect(youtubePlayer).not.toBeNull()
    expect(youtubePlayer?.getAttribute('data-video-id')).toBe('NXGXtm6gcxk')
    expect(container.querySelector('iframe[src^="https://example"]')).toBeNull()
  })

  it('redirects non-embeddable YouTube-host rows straight to YouTube', () => {
    const replace = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace },
    })

    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({ embedAllows: false }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    expect(replace).toHaveBeenCalledWith('https://www.youtube.com/watch?v=NXGXtm6gcxk')
    expect(container.textContent).toContain('Opening on YouTube')
    expect(container.textContent).not.toContain('embedAllows')
    expect(container.querySelector('[data-testid="solo-youtube-player"]')).toBeNull()

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('keeps party-capture embed-blocked copy when embedAllows is false', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({ embedAllows: false }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage('/watch/032-mitchell?partyCapture=1')

    expect(container.textContent).toContain('This episode is not available for in-app playback.')
    expect(container.querySelector('a[href="https://www.youtube.com/watch?v=NXGXtm6gcxk"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="solo-youtube-player"]')).toBeNull()
  })

  it('uses party-capture layout shell for Custom-host rows', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.test/movie',
      }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage('/watch/032-mitchell?partyCapture=1')

    expect(container.querySelector('.riffsync-solo-watch-page--party-capture')).not.toBeNull()
    expect(container.querySelector('.riffsync-solo-watch__player-shell')).not.toBeNull()
    expect(container.querySelector('iframe')).not.toBeNull()
  })

  it('does not render the media picker outside party-capture mode', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({ embedAllows: true }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    expect(container.querySelector('.riffsync-party-capture-picker')).toBeNull()
  })

  it('renders the media picker in party-capture mode', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({ embedAllows: true }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage('/watch/032-mitchell?partyCapture=1')

    expect(container.querySelector('.riffsync-party-capture-picker')).not.toBeNull()
    expect(container.textContent).toContain('Switch title')
  })

  it('shows embed-blocked copy when Custom iframe reports error', () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.test/movie',
      }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    const iframe = container.querySelector('iframe')
    act(() => {
      iframe?.dispatchEvent(new Event('error'))
    })

    expect(container.textContent).toContain('This page could not be embedded in RiffSync.')
    expect(container.querySelector('a[href="https://example.test/movie"]')).not.toBeNull()
  })

  it('keeps Solo page shell when the YouTube embed reports a broken link', () => {
    youtubePlayerFail.value = true
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode({ embedAllows: true }),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWatchPage()

    expect(container.querySelector('.riffsync-solo-watch-page')).not.toBeNull()
    expect(container.querySelector('.riffsync-solo-watch__player-shell')).not.toBeNull()
    expect(container.querySelector('[data-testid="solo-youtube-player-error"]')).not.toBeNull()
    expect(container.textContent).toContain('This video link is broken.')
    expect(
      container.querySelector('a[href="https://www.youtube.com/watch?v=NXGXtm6gcxk"]')?.textContent,
    ).toBe('Open on YouTube')
    expect(container.querySelector('h1.sr-only')?.textContent).toBe('Mitchell')
  })
})
