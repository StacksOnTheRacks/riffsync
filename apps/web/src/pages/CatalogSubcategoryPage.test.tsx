// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG_SUBCATEGORIES } from '../catalog/catalogBrowseIa'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { PENDING_PARTY_EPISODE_KEY } from '../catalog/pendingPartyStorage'
import { getFanAccessToken } from '../auth/fanTokens'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { CatalogSubcategoryPage } from './CatalogSubcategoryPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useCatalogListQuery = vi.fn()
const createRoom = vi.fn()

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => useCatalogListQuery(),
}))

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => null),
}))

vi.mock('../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: vi.fn(),
}))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    createRoom: (...args: unknown[]) => createRoom(...args),
  }
})

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
  episode({
    id: 'ep-short',
    experimentNumber: 2500,
    title: 'Robot Rumpus',
    tags: ['Era: Mike'],
    labels: ['Short'],
  }),
  episode({ id: 'ep-community', experimentNumber: 500, title: 'Community Riff', catalog: 'community' }),
  episode({
    id: 'ep-riff-material',
    experimentNumber: 1600,
    title: 'Riff Material Classic',
    catalog: 'riff_material',
  }),
  episode({
    id: 'ep-rifftrax-movie',
    experimentNumber: 700,
    title: 'RiffTrax Feature',
    catalog: 'rifftrax',
  }),
  episode({
    id: 'ep-rifftrax-short',
    experimentNumber: 701,
    title: 'RiffTrax Short Feature',
    catalog: 'rifftrax',
    labels: ['Short'],
  }),
  episode({ id: 'ep-movie-night', experimentNumber: 1500, title: 'Movie Night Pick', catalog: 'movie_night' }),
  episode({ id: 'ep-tv-shows', experimentNumber: 1601, title: 'TV Shows Pick', catalog: 'tv_shows' }),
  episode({
    id: 'ep-tv-shows-unplayable',
    experimentNumber: 1602,
    title: 'TV Shows Unplayable',
    catalog: 'tv_shows',
    youtubeVideoId: null,
    youtubeWatchUrl: null,
  }),
  episode({ id: 'ep-live', experimentNumber: 1700, title: 'Live Source', catalog: 'live' }),
  episode({ id: 'ep-other', experimentNumber: 999, title: 'Other Experiment', catalog: 'other' }),
]

function mst3kCardTitles(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll('.riffsync-channel-movie-card__title a')).map(
    (link) => link.textContent?.trim() ?? '',
  )
}

function mst3kListTitles(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll('.riffsync-channel-list-row__title a')).map(
    (link) => link.textContent?.trim() ?? '',
  )
}

describe('CatalogSubcategoryPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useCatalogListQuery.mockReset()
    createRoom.mockReset()
    vi.mocked(getFanAccessToken).mockReturnValue(null)
    sessionStorage.clear()
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
    vi.restoreAllMocks()
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

  function clickViewToggle(label: 'Cards' | 'List') {
    const button = Array.from(container.querySelectorAll('.riffsync-view-toggle__button')).find(
      (node) => node.getAttribute('aria-label') === label,
    )
    expect(button).toBeTruthy()
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it.each(
    CATALOG_SUBCATEGORIES.filter(
      (entry) =>
        entry.slug !== 'mst3k' &&
        entry.slug !== 'rifftrax' &&
        entry.slug !== 'movies' &&
        entry.slug !== 'tv-shows',
    ).map((entry) => [entry.path, entry.label, entry.subtitle] as const),
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

  it('renders ChannelHero and ViewToggle on /catalog/mst3k with sr-only h1', () => {
    renderSubcategoryPage('/catalog/mst3k')

    expect(container.querySelector('h1.sr-only')?.textContent).toBe('MST3K')
    expect(container.querySelector('.riffsync-channel-hero')).not.toBeNull()
    expect(container.querySelector('.riffsync-view-toggle')).not.toBeNull()
    expect(container.querySelector('.riffsync-channel-hero__visual-title')?.textContent).toBe(
      'Mystery Science Theater 3000',
    )
    expect(container.querySelector('.gen-breadcrumb')).toBeNull()
    expect(container.textContent).not.toContain('Subscribe')
    expect(container.textContent).not.toContain('Subscribers')
    expect(container.textContent).not.toContain('Home')
    expect(container.textContent).not.toContain('Videos')
    expect(container.textContent).not.toContain('Live')
  })

  it('defaults to Cards view on /catalog/mst3k', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const cardsButton = container.querySelector('[aria-label="Cards"]')
    const listButton = container.querySelector('[aria-label="List"]')
    expect(cardsButton?.getAttribute('aria-pressed')).toBe('true')
    expect(listButton?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.riffsync-channel-card-grid')).not.toBeNull()
    expect(container.querySelector('.riffsync-channel-list')).toBeNull()
  })

  it('flips aria-pressed when toggling Cards | List', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickViewToggle('List')

    expect(container.querySelector('[aria-label="Cards"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('[aria-label="List"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.riffsync-channel-list')).not.toBeNull()
    expect(container.querySelector('.riffsync-channel-card-grid')).toBeNull()

    clickViewToggle('Cards')
    expect(container.querySelector('[aria-label="Cards"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('activates ViewToggle buttons with Enter and Space', () => {
    renderSubcategoryPage('/catalog/mst3k')
    const listButton = container.querySelector('[aria-label="List"]') as HTMLButtonElement

    act(() => {
      listButton.focus()
      listButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      listButton.click()
    })
    expect(container.querySelector('.riffsync-channel-list')).not.toBeNull()

    const cardsButton = container.querySelector('[aria-label="Cards"]') as HTMLButtonElement
    act(() => {
      cardsButton.focus()
      cardsButton.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
      cardsButton.click()
    })
    expect(container.querySelector('.riffsync-channel-card-grid')).not.toBeNull()
  })

  it('shows the same filtered ids in Cards and List views', () => {
    renderSubcategoryPage('/catalog/mst3k')
    const cardTitles = mst3kCardTitles(container)

    clickViewToggle('List')
    const listTitles = mst3kListTitles(container)
    expect(listTitles).toEqual(cardTitles)
  })

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

  it('filters MST3K cards when an Era pill is selected', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Era: Joel')
    expect(mst3kCardTitles(container)).toEqual(['Pod People'])
  })

  it('filters MST3K cards when a Season pill is selected', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Season: 1')
    expect(mst3kCardTitles(container)).toEqual(['Cave Dwellers', 'Pod People'])
  })

  it('locks a season route to that season and updates the hero subtitle', () => {
    renderSubcategoryPage('/catalog/mst3k/season/3')

    expect(container.querySelector('h1.sr-only')?.textContent).toBe('MST3K')
    expect(container.querySelector('.riffsync-channel-hero__subtitle')?.textContent).toBe('Season 3')
    expect(container.querySelector('.riffsync-catalog-filter-bar__tag-groups')).toBeNull()
    expect(mst3kCardTitles(container)).toEqual(['Giant Spider'])
  })

  it('locks an era route to that era and updates the hero subtitle', () => {
    renderSubcategoryPage('/catalog/mst3k/era/mike')

    expect(container.querySelector('h1.sr-only')?.textContent).toBe('MST3K')
    expect(container.querySelector('.riffsync-channel-hero__subtitle')?.textContent).toBe('Mike Era')
    expect(container.querySelector('.riffsync-catalog-filter-bar__tag-groups')).toBeNull()
    expect(mst3kCardTitles(container)).toEqual(['Cave Dwellers', 'Robot Rumpus'])
  })

  it('locks the Shorts route to rows labeled Short and updates the hero subtitle', () => {
    renderSubcategoryPage('/catalog/mst3k/shorts')

    expect(container.querySelector('h1.sr-only')?.textContent).toBe('MST3K')
    expect(container.querySelector('.riffsync-channel-hero__subtitle')?.textContent).toBe('Short Riffs')
    expect(container.querySelector('.riffsync-catalog-filter-bar__tag-groups')).toBeNull()
    expect(mst3kCardTitles(container)).toEqual(['Robot Rumpus'])
  })

  it.each(['/catalog/rifftrax', '/catalog/rifftrax/movies'] as const)(
    'locks RiffTrax Movies route %s to rows without the Short label',
    (path) => {
      renderSubcategoryPage(path)

      expect(container.querySelector('h1')?.textContent).toBe('RiffTrax')
      expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBe(
        'RiffTrax Movies',
      )
      expect(container.querySelector('.riffsync-catalog-filter-bar__tag-groups')).toBeNull()
      expect(container.querySelector('.riffsync-channel-layout')).toBeNull()

      const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
        (link) => link.textContent?.trim(),
      )
      expect(titles).toEqual(['RiffTrax Feature'])
    },
  )

  it('locks the RiffTrax Shorts route to rows labeled Short', () => {
    renderSubcategoryPage('/catalog/rifftrax/shorts')

    expect(container.querySelector('h1')?.textContent).toBe('RiffTrax')
    expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBe(
      'RiffTrax Shorts',
    )
    expect(container.querySelector('.riffsync-channel-layout')).toBeNull()

    const titles = Array.from(container.querySelectorAll('.riffsync-catalog-card h3 a')).map(
      (link) => link.textContent?.trim(),
    )
    expect(titles).toEqual(['RiffTrax Short Feature'])
  })

  it('combines Era and Season pill filters with AND semantics', () => {
    renderSubcategoryPage('/catalog/mst3k')
    clickPill('Era: Joel')
    clickPill('Season: 1')
    expect(mst3kCardTitles(container)).toEqual(['Pod People'])
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

    expect(mst3kCardTitles(container)).toEqual(['Cave Dwellers'])
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

    const titles = mst3kCardTitles(container)
    expect(titles).toEqual(['Cave Dwellers', 'Pod People', 'Giant Spider', 'Emily Special', 'Robot Rumpus'])
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
    expect(container.querySelector('.riffsync-channel-layout')).toBeNull()

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.querySelector('h3 a')?.textContent?.trim()).toBe('Riff Material Classic')
  })

  it.each([
    ['/catalog/tv-shows', 'TV Shows', 'ep-tv-shows'] as const,
    ['/catalog/movies', 'Movies', 'ep-movie-night'] as const,
  ])('renders sr-only h1 and filters %s to playable rows for its catalog only', (path, label, expectedId) => {
    renderSubcategoryPage(path)

    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('h1.sr-only')?.textContent).toBe(label)
    expect(container.querySelector('.riffsync-catalog-page-header__subtitle')?.textContent).toBeTruthy()

    const cards = container.querySelectorAll('.riffsync-catalog-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.querySelector('h3 a')?.textContent?.trim()).toBe(
      catalogFixtures.find((entry) => entry.id === expectedId)?.title,
    )
    expect(container.textContent).not.toContain('Community Riff')
    expect(container.textContent).not.toContain('TV Shows Unplayable')
    expect(container.textContent).not.toContain('Live Source')
    expect(container.textContent).not.toContain('Other Experiment')
  })

  it('uses empty-catalog presentation on /catalog/tv-shows when no playable tv_shows rows exist', () => {
    useCatalogListQuery.mockReturnValue({
      data: [
        episode({
          id: 'ep-tv-unplayable-only',
          experimentNumber: 1603,
          title: 'Unplayable TV',
          catalog: 'tv_shows',
          youtubeVideoId: null,
          youtubeWatchUrl: null,
        }),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderSubcategoryPage('/catalog/tv-shows')

    expect(container.querySelector('h1.sr-only')?.textContent).toBe('TV Shows')
    expect(container.querySelector('.riffsync-catalog-grid')?.children.length).toBe(0)
    expect(container.textContent).toContain('No episodes are available for in-app playback yet.')
  })

  it('shows sr-only h1 on TV Shows loading path', () => {
    useCatalogListQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderSubcategoryPage('/catalog/tv-shows')
    expect(container.querySelector('h1.sr-only')?.textContent).toBe('TV Shows')
  })

  it('sets poster img alt text to each MST3K episode title', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const posterImages = Array.from(
      container.querySelectorAll('.riffsync-channel-movie-card__poster'),
    ) as HTMLImageElement[]

    expect(posterImages.length).toBeGreaterThan(0)
    for (const img of posterImages) {
      expect(img.getAttribute('alt')).toBeTruthy()
    }
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

  it('shows sr-only h1 on MST3K loading path', () => {
    useCatalogListQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderSubcategoryPage('/catalog/mst3k')
    expect(container.querySelector('h1.sr-only')?.textContent).toBe('MST3K')
  })

  it('MST3K title and poster links navigate to /watch/{id} only', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const links = Array.from(
      container.querySelectorAll('.riffsync-channel-movie-card a[href]'),
    ) as HTMLAnchorElement[]
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/watch\//)
    }
  })

  it('signed-out Start Party sets pending key and starts Hosted UI sign-in', () => {
    renderSubcategoryPage('/catalog/mst3k')

    const startParty = Array.from(container.querySelectorAll('button.gen-button')).find(
      (button) => button.textContent?.trim() === 'Start Party',
    ) as HTMLButtonElement
    act(() => {
      startParty.click()
    })

    expect(sessionStorage.getItem(PENDING_PARTY_EPISODE_KEY)).toBeTruthy()
    expect(startFanHostedUiSignIn).toHaveBeenCalled()
    expect(createRoom).not.toHaveBeenCalled()
  })

  it('signed-in Start Party calls createRoom with catalogEpisodeId and visibility public', async () => {
    vi.mocked(getFanAccessToken).mockReturnValue('fan-token')
    createRoom.mockResolvedValue({ roomId: 'room-123' })

    renderSubcategoryPage('/catalog/mst3k')

    const startParty = Array.from(container.querySelectorAll('button.gen-button')).find(
      (button) => button.textContent?.trim() === 'Start Party',
    ) as HTMLButtonElement
    await act(async () => {
      startParty.click()
      await Promise.resolve()
    })

    expect(createRoom).toHaveBeenCalledWith(
      'fan-token',
      expect.objectContaining({
        catalogEpisodeId: expect.any(String),
        visibility: 'public',
      }),
    )
  })

  it('stacks MST3K card grid to single column at max-width 767px', () => {
    const matchMediaListeners: Array<(event: MediaQueryListEvent) => void> = []
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const matches = query === '(max-width: 767px)'
      const mql = {
        matches,
        media: query,
        onchange: null,
        addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
          matchMediaListeners.push(listener)
        },
        removeEventListener: () => undefined,
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          matchMediaListeners.push(listener)
        },
        removeListener: () => undefined,
        dispatchEvent: () => true,
      } as MediaQueryList
      return mql
    })

    renderSubcategoryPage('/catalog/mst3k')
    expect(container.querySelector('.riffsync-channel-card-grid')).not.toBeNull()
  })
})
