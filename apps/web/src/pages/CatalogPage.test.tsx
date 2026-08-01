// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPage } from './CatalogPage'
import { CATALOG_HUB_ENTRY_LINKS } from '../catalog/catalogBrowseIa'
import type { CatalogEpisode } from '../catalog/catalogTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useCatalogListQuery = vi.fn()

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => useCatalogListQuery(),
}))

function episode(overrides: Partial<CatalogEpisode> & Pick<CatalogEpisode, 'id'>): CatalogEpisode {
  return {
    experimentNumber: 100,
    title: 'Default title',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://youtube.com/watch?v=abc123',
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

const catalogFixtures: CatalogEpisode[] = [
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', tags: ['Era: Joel'] }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', tags: ['Era: Mike'] }),
]

describe('CatalogPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useCatalogListQuery.mockReset()
    useCatalogListQuery.mockReturnValue({
      data: catalogFixtures,
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

  function renderCatalogPage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>,
      )
    })
  }

  it('sets poster img alt text to each episode title', () => {
    renderCatalogPage()

    const posterImages = Array.from(
      container.querySelectorAll('.riffsync-catalog-card img'),
    ) as HTMLImageElement[]

    expect(posterImages).toHaveLength(catalogFixtures.length)
    expect(posterImages.map((img) => img.getAttribute('alt')).sort()).toEqual(['Cave Dwellers', 'Pod People'])
    for (const img of posterImages) {
      expect(img.getAttribute('alt')).not.toBe('')
    }
  })

  it('renders hub entry links in the page header above search and the mixed grid in fixed order', () => {
    renderCatalogPage()

    const pageHeader = container.querySelector('.riffsync-catalog-page-header')
    expect(pageHeader?.querySelector('h1')?.textContent).toBe('Catalog')
    expect(pageHeader?.querySelector('nav[aria-label="breadcrumb"]')).toBeNull()

    const hubNav = pageHeader?.querySelector('.riffsync-catalog-hub-entry-links')
    expect(hubNav).not.toBeNull()
    expect(container.textContent).not.toContain('Push the button, Frank')
    expect(container.textContent).not.toContain('Movie Night')

    const filterBar = container.querySelector('.riffsync-catalog-filter-bar')
    const grid = container.querySelector('.riffsync-catalog-grid')
    expect(hubNav!.compareDocumentPosition(filterBar!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(filterBar!.compareDocumentPosition(grid!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const hubLinks = Array.from(
      container.querySelectorAll('.riffsync-catalog-hub-entry-links__link'),
    ) as HTMLAnchorElement[]

    expect(hubLinks).toHaveLength(CATALOG_HUB_ENTRY_LINKS.length)
    expect(hubLinks.map((link) => link.textContent?.trim())).toEqual(
      CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.label),
    )
    expect(hubLinks.map((link) => link.getAttribute('href'))).toEqual(
      CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href),
    )
  })

  it('does not render public catalog-chip toggles on the hub', () => {
    renderCatalogPage()

    expect(container.querySelector('.riffsync-catalog-filter-bar__era-group')).toBeNull()
    expect(container.querySelector('.riffsync-catalog-filter-bar__era')).toBeNull()
  })

  it('includes Custom-host playable rows in the hub grid', () => {
    useCatalogListQuery.mockReturnValue({
      data: [
        ...catalogFixtures,
        episode({
          id: 'ep-custom',
          title: 'Custom Host Film',
          playbackHost: 'custom',
          customPlaybackUrl: 'https://example.com/movie',
          youtubeVideoId: null,
        }),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    renderCatalogPage()

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(3)
    expect(container.textContent).toContain('Custom Host Film')
  })

  it('shows host-aware empty copy when no episodes are playable in-app', () => {
    useCatalogListQuery.mockReturnValue({
      data: [
        episode({
          id: 'ep-unplayable',
          playbackHost: 'custom',
          customPlaybackUrl: null,
          youtubeVideoId: null,
        }),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    renderCatalogPage()

    expect(container.textContent).toContain('No episodes are available for in-app playback yet.')
  })

  it('keeps the mixed grid unfiltered by catalog on the hub for public categories', () => {
    renderCatalogPage()

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(catalogFixtures.length)
  })

  it('excludes movie_night rows from the public hub grid', () => {
    useCatalogListQuery.mockReturnValue({
      data: [
        ...catalogFixtures,
        episode({
          id: 'ep-movie-night',
          title: 'Movie Night Pick',
          catalog: 'movie_night',
        }),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    renderCatalogPage()

    expect(container.querySelectorAll('.riffsync-catalog-card')).toHaveLength(catalogFixtures.length)
    expect(container.textContent).not.toContain('Movie Night Pick')
  })
})
