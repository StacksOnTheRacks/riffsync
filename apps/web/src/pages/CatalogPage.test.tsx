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
    era: 'joel',
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://youtube.com/watch?v=abc123',
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    ...overrides,
  }
}

const catalogFixtures: CatalogEpisode[] = [
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', era: 'joel' }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', era: 'mike' }),
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

  it('renders four hub entry links above search and the mixed grid in fixed order', () => {
    renderCatalogPage()

    const hubNav = container.querySelector('.riffsync-catalog-hub-entry-links')
    expect(hubNav).not.toBeNull()

    const filterBar = container.querySelector('.riffsync-catalog-filter-bar')
    const grid = container.querySelector('.riffsync-catalog-grid')
    expect(hubNav!.compareDocumentPosition(filterBar!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(filterBar!.compareDocumentPosition(grid!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const hubLinks = Array.from(
      container.querySelectorAll('.riffsync-catalog-hub-entry-links__link'),
    ) as HTMLAnchorElement[]

    expect(hubLinks).toHaveLength(4)
    expect(hubLinks.map((link) => link.textContent?.trim())).toEqual(
      CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.label),
    )
    expect(hubLinks.map((link) => link.getAttribute('href'))).toEqual(
      CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href),
    )
  })

  it('does not render public era-chip toggles on the hub', () => {
    renderCatalogPage()

    expect(container.querySelector('.riffsync-catalog-filter-bar__era-group')).toBeNull()
    expect(container.querySelector('.riffsync-catalog-filter-bar__era')).toBeNull()
  })

  it('keeps the mixed grid unfiltered by era on the hub', () => {
    renderCatalogPage()

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(catalogFixtures.length)
  })
})
