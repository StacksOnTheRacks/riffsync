// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { EpisodeTileActions } from './EpisodeTileActions'

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

describe('EpisodeTileActions', () => {
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

  function renderActions(ep: CatalogEpisode) {
    act(() => {
      root.render(
        <MemoryRouter>
          <EpisodeTileActions episode={ep} />
        </MemoryRouter>,
      )
    })
  }

  it('opens YouTube directly for non-embeddable episodes with a watch URL', () => {
    renderActions(episode({ embedAllows: false }))

    const watchSolo = container.querySelector('button.gen-button--ghost') as HTMLButtonElement | null
    expect(watchSolo).not.toBeNull()

    act(() => {
      watchSolo?.click()
    })

    expect(window.open).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=NXGXtm6gcxk',
      '_blank',
      'noopener,noreferrer',
    )
    expect(container.querySelector('a[href="/watch/032-mitchell"]')).toBeNull()
  })

  it('keeps the internal watch link for embeddable episodes', () => {
    renderActions(episode({ embedAllows: true }))

    const watchSolo = container.querySelector('a.gen-button--ghost') as HTMLAnchorElement | null
    expect(watchSolo?.getAttribute('href')).toBe('/watch/032-mitchell')
    expect(container.querySelector('button.gen-button--ghost')).toBeNull()
  })
})
