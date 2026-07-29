// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { CatalogGridCard } from './CatalogGridCard'

vi.mock('../../auth/fanTokens', () => ({
  getFanAccessToken: () => null,
}))

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: vi.fn(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

describe('CatalogGridCard', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.spyOn(window, 'open').mockReturnValue(null)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderCard(ep: CatalogEpisode) {
    act(() => {
      root.render(
        <MemoryRouter>
          <CatalogGridCard episode={ep} />
        </MemoryRouter>,
      )
    })
  }

  it('renders all episode tags in source order', () => {
    renderCard(
      episode({
        tags: ['Era: Joel', 'Season: 1', 'Genre: Comedy'],
      }),
    )

    const tagEls = Array.from(container.querySelectorAll('.riffsync-catalog-card__tag'))
    expect(tagEls.map((el) => el.textContent)).toEqual(['Era: Joel', 'Season: 1', 'Genre: Comedy'])
  })

  it('renders arbitrary tag namespaces without special casing', () => {
    renderCard(
      episode({
        tags: ['CustomNamespace: FutureValue', 'Another: Shape'],
      }),
    )

    expect(container.textContent).toContain('CustomNamespace: FutureValue')
    expect(container.textContent).toContain('Another: Shape')
  })

  it('renders no advisory slot when tags are empty and embed is allowed', () => {
    renderCard(episode({ tags: [], playbackExpectation: 'ad_supported' }))

    expect(container.querySelector('.riffsync-catalog-card__advisory')).toBeNull()
    expect(container.textContent).not.toContain('Ads may appear')
    expect(container.textContent).not.toContain('Premium-friendly')
    expect(container.textContent).not.toContain('Likely ad-supported')
  })

  it('shows YouTube embed advisory for YouTube-host rows when embedAllows is false', () => {
    renderCard(
      episode({
        tags: ['Era: Mike'],
        playbackExpectation: 'premium',
        embedAllows: false,
      }),
    )

    expect(container.textContent).toContain('In-app YouTube embed is not available for this episode.')
    expect(container.textContent).toContain('Era: Mike')
  })

  it('does not show embed advisory on Custom-host rows when embedAllows is false', () => {
    renderCard(
      episode({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/movie',
        embedAllows: false,
      }),
    )

    expect(container.textContent).not.toContain('In-app YouTube embed is not available')
  })

  it('keeps Watch Solo enabled via internal link when embedAllows is false on YouTube-host rows', () => {
    renderCard(episode({ embedAllows: false }))

    const watchSolo = container.querySelector('a.gen-button--ghost') as HTMLAnchorElement | null
    expect(watchSolo?.getAttribute('href')).toBe('/watch/032-mitchell')
    expect(container.querySelector('button.gen-button--ghost')).toBeNull()
  })
})
