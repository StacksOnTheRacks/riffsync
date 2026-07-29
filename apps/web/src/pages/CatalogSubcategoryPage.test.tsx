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
  episode({
    id: 'ep-joel',
    experimentNumber: 200,
    title: 'Pod People',
    tags: ['Era: Joel', 'Season: 1'],
  }),
  episode({
    id: 'ep-mike',
    experimentNumber: 101,
    title: 'Cave Dwellers',
    tags: ['Era: Mike', 'Season: 1'],
  }),
  episode({
    id: 'ep-jonah',
    experimentNumber: 310,
    title: 'Giant Spider',
    tags: ['Era: Jonah', 'Season: 3'],
  }),
  episode({
    id: 'ep-emily',
    experimentNumber: 1200,
    title: 'Emily Special',
    tags: ['Era: Emily', 'Season: 12'],
  }),
  episode({ id: 'ep-community', experimentNumber: 500, title: 'Community Riff', catalog: 'community' }),
  episode({
    id: 'ep-riff-material',
    experimentNumber: 1600,
    title: 'Riff Material Classic',
    catalog: 'riff_material',
  }),
  episode({ id: 'ep-movie-night', experimentNumber: 1500, title: 'Movie Night Pick', catalog: 'movie_night' }),
  episode({ id: 'ep-other', experimentNumber: 999, title: 'Other Experiment', catalog: 'other' }),
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

  function clickPill(label: string) {
    const pill = Array.from(container.querySelectorAll('.riffsync-catalog-filter-bar__era')).find(
      (button) => button.textContent?.trim() === label,
    )
    expect(pill).toBeTruthy()
    act(() => {
      pill?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it.each(
    CATALOG_SUBCATEGORIES.filter((entry) => entry.slug !== 'mst3k').map(
      (entry) => [entry.path, entry.label, entry.subtitle] as const,
    ),
  )(
    'renders H1, subtitle, search, and filtered grid for %s without tag pills',
    (path, label, subtitle) => {
      renderSubcategoryPage(path)

      const h1 = container.querySelector('h1')
      expect(h1?.textContent).toBe(label)

      expect(container.querySelector('.gen-breadcrumb nav[aria-label="breadcrumb"]')).toBeNull()
      expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBe(
        subtitle,
      )

      expect(container.querySelector('.riffsync-catalog-filter-bar')).not.toBeNull()
      expect(container.querySelector('.riffsync-catalog-filter-bar__tag-groups')).toBeNull()
      expect(container.querySelector('input[type="search"]')).not.toBeNull()

      const subcategory = CATALOG_SUBCATEGORIES.find((entry) => entry.path === path)!
      const expectedIds = filterCatalogEntries(catalogFixtures, {
        titleQuery: '',
        catalogs: [subcategory.catalog],
      }).map((entry) => entry.id)

      const cards = container.querySelectorAll('.riffsync-catalog-card')
      expect(cards).toHaveLength(expectedIds.length)
    },
  )

  it('renders Era and Season pill groups on /catalog/mst3k', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const pillLabels = Array.from(container.querySelectorAll('.riffsync-catalog-filter-bar__era')).map(
      (button) => button.textContent?.trim(),
    )

    expect(pillLabels).toEqual(
      expect.arrayContaining(['Era: Joel', 'Era: Mike', 'Era: Jonah', 'Era: Emily', 'Season: 1', 'Season: 3', 'Season: 12']),
    )
    expect(container.querySelectorAll('[aria-label="Filter by Era"]').length).toBe(1)
    expect(container.querySelectorAll('[aria-label="Filter by Season"]').length).toBe(1)
  })

  it('filters MST3K grid when an Era pill is selected', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Era: Joel')

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )
    expect(titles).toEqual(['Pod People'])
  })

  it('filters MST3K grid when a Season pill is selected', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Season: 1')

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )
    expect(titles).toEqual(['Cave Dwellers', 'Pod People'])
  })

  it('combines Era and Season pill filters with AND semantics', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Era: Joel')
    clickPill('Season: 1')

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )
    expect(titles).toEqual(['Pod People'])
  })

  it('keeps title search working with selected MST3K pills', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Season: 1')

    const search = container.querySelector('input[type="search"]') as HTMLInputElement
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(search, 'cave')
      search.dispatchEvent(new Event('input', { bubbles: true }))
      search.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )
    expect(titles).toEqual(['Cave Dwellers'])
  })

  it('gracefully omits the Season pill group when no Season tags exist', () => {
    useCatalogListQuery.mockReturnValue({
      data: [
        episode({ id: 'ep-joel-only', experimentNumber: 200, title: 'Pod People', tags: ['Era: Joel'] }),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderSubcategoryPage('/catalog/mst3k')

    expect(container.querySelector('[aria-label="Filter by Era"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by Season"]')).toBeNull()
  })

  it('MST3K includes host-tagged rows and excludes other catalogs', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )

    expect(titles).toEqual(['Cave Dwellers', 'Pod People', 'Giant Spider', 'Emily Special'])
    expect(titles).not.toContain('Community Riff')
    expect(titles).not.toContain('Riff Material Classic')
    expect(titles).not.toContain('Movie Night Pick')
    expect(titles).not.toContain('Other Experiment')
  })

  it('Riff Material shows public label in chrome while filtering riff_material rows', () => {
    renderSubcategoryPage('/catalog/riff-material')

    expect(container.querySelector('h1')?.textContent).toBe('Riff Material')
    expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBe(
      'Cheesy Flicks Ready to Riff',
    )

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.querySelector('h3 a')?.textContent?.trim()).toBe('Riff Material Classic')
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
      data: [episode({ id: 'ep-joel-only', experimentNumber: 200, title: 'Pod People' })],
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
