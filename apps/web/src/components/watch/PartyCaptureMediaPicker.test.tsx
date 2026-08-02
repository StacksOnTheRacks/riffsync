// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartyCaptureMediaPicker } from './PartyCaptureMediaPicker'
import type { CatalogEpisode } from '../../catalog/catalogTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const useCatalogListQuery = vi.fn()

vi.mock('../../catalog/catalogQueries', () => ({
  useCatalogListQuery: (...args: unknown[]) => useCatalogListQuery(...args),
}))

vi.mock('../../config/publicOrigin', () => ({
  getPublicOrigin: () => 'https://riffsync.tv',
}))

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

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('PartyCaptureMediaPicker', () => {
  let container: HTMLDivElement
  let root: Root
  let assignSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined)
    useCatalogListQuery.mockReset()
    useCatalogListQuery.mockReturnValue({
      data: [
        episode(),
        episode({
          id: '101-cave-dwellers',
          experimentNumber: 101,
          title: 'Cave Dwellers',
          youtubeVideoId: 'CAVEdwell01',
        }),
        episode({
          id: '200-custom',
          experimentNumber: 200,
          title: 'Custom Movie',
          playbackHost: 'custom',
          customPlaybackUrl: 'https://example.test/movie',
          youtubeVideoId: null,
        }),
        episode({
          id: '300-youtube-direct',
          experimentNumber: 300,
          title: 'Direct YouTube',
          embedAllows: false,
          youtubeVideoId: 'DIRECTwatch',
          youtubeWatchUrl: 'https://youtu.be/DIRECTwatch',
        }),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    assignSpy.mockRestore()
    vi.useRealTimers()
  })

  function renderPicker(currentEpisodeId = '032-mitchell') {
    act(() => {
      root.render(<PartyCaptureMediaPicker currentEpisodeId={currentEpisodeId} />)
    })
  }

  it('starts expanded with the current title selected', () => {
    renderPicker()

    expect(container.querySelector('.riffsync-party-capture-picker--expanded')).not.toBeNull()
    expect(container.textContent).toContain('Now playing')
    expect(container.textContent).toContain('Mitchell')
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('032-mitchell')
  })

  it('filters playable title options', () => {
    renderPicker()

    act(() => {
      setInputValue(container.querySelector('input[type="search"]') as HTMLInputElement, 'cave')
    })

    const options = Array.from(container.querySelectorAll('option')).map((option) =>
      option.textContent?.trim(),
    )
    expect(options).toEqual(['32. Mitchell', '101. Cave Dwellers'])
  })

  it('auto-hides and reopens from the hover strip', () => {
    renderPicker()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(container.querySelector('.riffsync-party-capture-picker--collapsed')).not.toBeNull()

    act(() => {
      container.querySelector('.riffsync-party-capture-picker')?.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true }),
      )
    })
    expect(container.querySelector('.riffsync-party-capture-picker--expanded')).not.toBeNull()
  })

  it('navigates this tab to a selected party-capture watch URL', () => {
    renderPicker()

    act(() => {
      setSelectValue(container.querySelector('select') as HTMLSelectElement, '200-custom')
    })

    expect(assignSpy).toHaveBeenCalledWith('https://riffsync.tv/watch/200-custom?partyCapture=1')
  })

  it('uses the direct YouTube URL for non-embeddable YouTube titles', () => {
    renderPicker()

    act(() => {
      setSelectValue(container.querySelector('select') as HTMLSelectElement, '300-youtube-direct')
    })

    expect(assignSpy).toHaveBeenCalledWith('https://www.youtube.com/watch?v=DIRECTwatch')
  })
})
