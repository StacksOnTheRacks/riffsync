// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { PublicRouteHeadTags } from './PublicRouteHeadTags'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useCatalogEpisodeQuery = vi.fn()

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogEpisodeQuery: (...args: unknown[]) => useCatalogEpisodeQuery(...args),
}))

vi.mock('../config/publicOrigin', () => ({
  getPublicOrigin: () => 'https://riffsync.tv',
}))

function episode(overrides: Partial<CatalogEpisode> = {}): CatalogEpisode {
  return {
    id: '101-the-crawling-eye',
    experimentNumber: 101,
    title: 'The Crawling Eye',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=abc123',
    tagline: 'A mountain mystery gets riffed.',
    posterImageUrl: '/poster.jpg',
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

describe('PublicRouteHeadTags', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    document.head.innerHTML = `
      <title>RiffSync</title>
      <meta name="description" content="Generic" />
      <link rel="canonical" href="https://riffsync.tv/" />
      <meta property="og:url" content="https://riffsync.tv/" />
      <meta property="og:title" content="RiffSync" />
      <meta property="og:description" content="Generic" />
      <meta property="og:image" content="https://riffsync.tv/og-card.png" />
      <meta name="twitter:title" content="RiffSync" />
      <meta name="twitter:description" content="Generic" />
      <meta name="twitter:image" content="https://riffsync.tv/og-card.png" />
    `
    useCatalogEpisodeQuery.mockReset()
    useCatalogEpisodeQuery.mockReturnValue({
      data: undefined,
      isPending: true,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderAt(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <PublicRouteHeadTags />
        </MemoryRouter>,
      )
    })
  }

  it('applies static indexable route head tags on client navigation', async () => {
    await renderAt('/catalog')

    expect(document.title).toBe('RiffSync Catalog - Browse the Library')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://riffsync.tv/catalog',
    )
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('applies watch route head tags after the episode loads', async () => {
    useCatalogEpisodeQuery.mockReturnValue({
      data: episode(),
      isPending: false,
    })

    await renderAt('/watch/101-the-crawling-eye')

    expect(document.title).toBe('The Crawling Eye - RiffSync')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://riffsync.tv/watch/101-the-crawling-eye',
    )
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://riffsync.tv/poster.jpg',
    )
  })

  it('applies noindex shell tags for ephemeral routes', async () => {
    await renderAt('/lobby')

    expect(document.title).toBe('RiffSync')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex',
    )
  })
})
