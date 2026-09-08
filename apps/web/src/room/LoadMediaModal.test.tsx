// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadMediaModal } from './LoadMediaModal'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const refetch = vi.fn()

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => ({
    data: mockCatalog,
    isPending: false,
    isError: false,
    refetch,
  }),
}))

const mockCatalog: CatalogEpisode[] = [
  {
    id: 'ep-mst',
    experimentNumber: 1,
    title: 'MST Episode',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'abc12345678',
    youtubeWatchUrl: 'https://youtube.com/watch?v=abc12345678',
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
  },
  {
    id: 'ep-movie',
    experimentNumber: 2,
    title: 'Movie Night Title',
    catalog: 'movie_night',
    tags: [],
    labels: [],
    youtubeVideoId: 'xyz98765432',
    youtubeWatchUrl: 'https://youtube.com/watch?v=xyz98765432',
    tagline: null,
    posterImageUrl: 'https://example.com/poster.jpg',
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
  },
]

describe('LoadMediaModal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('exposes dialog a11y and names Load Media', () => {
    act(() => {
      root.render(
        <LoadMediaModal
          selectedCatalogEpisodeId="ep-mst"
          applying={false}
          applyError={null}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />,
      )
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('riffsync-load-media-title')
    expect(container.querySelector('#riffsync-load-media-title')?.textContent).toBe('Load Media')
  })

  it('default-selects the current catalogEpisodeId with aria-selected', () => {
    act(() => {
      root.render(
        <LoadMediaModal
          selectedCatalogEpisodeId="ep-movie"
          applying={false}
          applyError={null}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />,
      )
    })

    const selected = container.querySelector('[aria-selected="true"]')
    expect(selected?.textContent).toContain('Movie Night Title')
    const loadBtn = selected?.querySelector('.riffsync-load-media__load-btn')
    expect(loadBtn?.getAttribute('aria-label')).toBe('Load media: Movie Night Title')
  })

  it('includes playable movie_night rows and Movies category label', () => {
    act(() => {
      root.render(
        <LoadMediaModal
          selectedCatalogEpisodeId="ep-mst"
          applying={false}
          applyError={null}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />,
      )
    })

    expect(container.textContent).toContain('Movies')
    const movieBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Movies')
    act(() => movieBtn?.click())
    expect(container.textContent).toContain('Movie Night Title')
  })

  it('calls onConfirm when LOAD MEDIA is clicked', () => {
    const onConfirm = vi.fn()
    act(() => {
      root.render(
        <LoadMediaModal
          selectedCatalogEpisodeId="ep-mst"
          applying={false}
          applyError={null}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />,
      )
    })

    const loadBtn = container.querySelector('.riffsync-load-media__load-btn') as HTMLButtonElement
    act(() => loadBtn.click())
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'ep-mst' }))
  })

  it('dismisses on Escape', () => {
    const onCancel = vi.fn()
    act(() => {
      root.render(
        <LoadMediaModal
          selectedCatalogEpisodeId="ep-mst"
          applying={false}
          applyError={null}
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />,
      )
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onCancel).toHaveBeenCalled()
  })
})
