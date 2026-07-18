// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG_SUBCATEGORIES } from '../catalog/catalogBrowseIa'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { CatalogSubcategoryPage } from './CatalogSubcategoryPage'

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
  episode({ id: 'ep-joel', experimentNumber: 200, title: 'Pod People', era: 'joel' }),
  episode({ id: 'ep-mike', experimentNumber: 101, title: 'Cave Dwellers', era: 'mike' }),
  episode({ id: 'ep-jonah', experimentNumber: 310, title: 'Giant Spider', era: 'jonah' }),
  episode({ id: 'ep-emily', experimentNumber: 1200, title: 'Emily Special', era: 'emily' }),
  episode({ id: 'ep-community', experimentNumber: 500, title: 'Community Riff', era: 'community' }),
  episode({ id: 'ep-riffable', experimentNumber: 1600, title: 'Riffable Classic', era: 'riffable' }),
  episode({ id: 'ep-movie-night', experimentNumber: 1500, title: 'Movie Night Pick', era: 'movie_night' }),
  episode({ id: 'ep-other', experimentNumber: 999, title: 'Other Experiment', era: 'other' }),
]

describe('CatalogSubcategoryPage', () => {
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

  function renderSubcategoryPage(path: string) {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <CatalogSubcategoryPage />
        </MemoryRouter>,
      )
    })
  }

  it.each(
    CATALOG_SUBCATEGORIES.map((entry) => [entry.path, entry.label, entry.subtitle] as const),
  )(
    'renders H1, subtitle, search, and filtered grid for %s',
    (path, label, subtitle) => {
      renderSubcategoryPage(path)

      const h1 = container.querySelector('h1')
      expect(h1?.textContent).toBe(label)

      expect(container.querySelector('.gen-breadcrumb nav[aria-label="breadcrumb"]')).toBeNull()
      expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBe(
        subtitle,
      )

      expect(container.querySelector('.riffsync-catalog-filter-bar')).not.toBeNull()
      expect(container.querySelector('.riffsync-catalog-filter-bar__era-group')).toBeNull()
      expect(container.querySelector('input[type="search"]')).not.toBeNull()

      const subcategory = CATALOG_SUBCATEGORIES.find((entry) => entry.path === path)!
      const expectedIds = filterCatalogEntries(catalogFixtures, {
        titleQuery: '',
        eras: subcategory.eras,
      }).map((entry) => entry.id)

      const cards = container.querySelectorAll('.riffsync-catalog-card')
      expect(cards).toHaveLength(expectedIds.length)
    },
  )

  it('MST3K includes host eras and excludes community, riffable, movie_night, and other', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )

    expect(titles).toEqual(['Cave Dwellers', 'Pod People', 'Giant Spider', 'Emily Special'])
    expect(titles).not.toContain('Community Riff')
    expect(titles).not.toContain('Riffable Classic')
    expect(titles).not.toContain('Movie Night Pick')
    expect(titles).not.toContain('Other Experiment')
  })

  it('Riff-Ready shows public label in chrome while filtering riffable rows', () => {
    renderSubcategoryPage('/catalog/riff-ready')

    expect(container.querySelector('h1')?.textContent).toBe('Riff-Ready')
    expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBe(
      'Cheesy Flicks Ready to Riff',
    )

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.querySelector('h3 a')?.textContent?.trim()).toBe('Riffable Classic')
  })

  it('sets poster img alt text to each episode title', () => {
    renderSubcategoryPage('/catalog/community')

    const posterImages = Array.from(
      container.querySelectorAll('.riffsync-catalog-card img'),
    ) as HTMLImageElement[]

    expect(posterImages).toHaveLength(1)
    expect(posterImages[0]?.getAttribute('alt')).toBe('Community Riff')
  })

  it('shows empty-catalog presentation when the subcategory filter matches no rows', () => {
    useCatalogListQuery.mockReturnValue({
      data: [episode({ id: 'ep-joel-only', experimentNumber: 200, title: 'Pod People', era: 'joel' })],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderSubcategoryPage('/catalog/community')

    expect(container.querySelector('.riffsync-catalog-grid')?.children.length).toBe(0)
    expect(container.querySelector('.riffsync-catalog-no-match')).not.toBeNull()
    expect(container.textContent).toContain('No episodes match your filters')
  })
})
