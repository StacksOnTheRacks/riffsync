// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import type { CatalogEpisode } from '../catalog/catalogTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useCatalogListQuery = vi.fn()
const useCatalogCarouselQuery = vi.fn()
const useCatalogSpotlightQuery = vi.fn()

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => useCatalogListQuery(),
  useCatalogCarouselQuery: () => useCatalogCarouselQuery(),
  useCatalogSpotlightQuery: () => useCatalogSpotlightQuery(),
}))

function episode(overrides: Partial<CatalogEpisode> & Pick<CatalogEpisode, 'id'>): CatalogEpisode {
  return {
    experimentNumber: 100,
    title: 'Pod People',
    catalog: 'mst3k',
    tags: ['Era: Joel'],
    labels: [],
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://youtube.com/watch?v=abc123',
    tagline: 'Push the button, Frank.',
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: true,
    spotlight: true,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  }
}

const playableEpisode = episode({ id: 'ep-1', title: 'Pod People' })

function mockCatalogQueries(options: {
  list?: ReturnType<typeof useCatalogListQuery>
  carousel?: ReturnType<typeof useCatalogCarouselQuery>
  spotlight?: ReturnType<typeof useCatalogSpotlightQuery>
}) {
  useCatalogListQuery.mockReturnValue(
    options.list ?? {
      data: [playableEpisode],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    },
  )
  useCatalogCarouselQuery.mockReturnValue(
    options.carousel ?? {
      data: [playableEpisode],
    },
  )
  useCatalogSpotlightQuery.mockReturnValue(
    options.spotlight ?? {
      data: [playableEpisode],
    },
  )
}

describe('HomePage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useCatalogListQuery.mockReset()
    useCatalogCarouselQuery.mockReset()
    useCatalogSpotlightQuery.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHomePage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      )
    })
  }

  function srOnlyHeadings(): HTMLHeadingElement[] {
    return Array.from(container.querySelectorAll('h1.sr-only'))
  }

  it('renders exactly one sr-only H1 with text RiffSync on the happy path', () => {
    mockCatalogQueries({})
    renderHomePage()

    const headings = srOnlyHeadings()
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('RiffSync')
  })

  it('renders exactly one sr-only H1 while loading', () => {
    mockCatalogQueries({
      list: {
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      },
    })
    renderHomePage()

    const headings = srOnlyHeadings()
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('RiffSync')
  })

  it('renders exactly one sr-only H1 on catalog load error', () => {
    mockCatalogQueries({
      list: {
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error('Catalog unavailable'),
        refetch: vi.fn(),
      },
    })
    renderHomePage()

    const headings = srOnlyHeadings()
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('RiffSync')
  })

  it('renders exactly one sr-only H1 when the catalog is empty', () => {
    mockCatalogQueries({
      list: {
        data: [],
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      },
    })
    renderHomePage()

    const headings = srOnlyHeadings()
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('RiffSync')
  })

  it('renders exactly one sr-only H1 when no episodes are playable in-app', () => {
    mockCatalogQueries({
      list: {
        data: [episode({ id: 'ep-no-playback', youtubeVideoId: null, youtubeWatchUrl: null })],
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      },
    })
    renderHomePage()

    const headings = srOnlyHeadings()
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('RiffSync')
    expect(container.textContent).toContain('No episodes are available for in-app playback yet.')
  })

  it('includes Custom-host playable rows in home carousel and rows', () => {
    const customEpisode = episode({
      id: 'ep-custom',
      title: 'Custom Host Film',
      playbackHost: 'custom',
      customPlaybackUrl: 'https://example.com/movie',
      youtubeVideoId: null,
      carousel: true,
      spotlight: true,
    })
    mockCatalogQueries({
      list: { data: [customEpisode], isPending: false, isError: false, error: null, refetch: vi.fn() },
      carousel: { data: [customEpisode] },
      spotlight: { data: [customEpisode] },
    })
    renderHomePage()

    expect(container.textContent).toContain('Custom Host Film')
  })
})
