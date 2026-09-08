// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { GlobalSearchCombobox } from './GlobalSearchCombobox'

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const useCatalogListQuery = vi.fn()
const navigate = vi.fn()

vi.mock('../../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => useCatalogListQuery(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

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

describe('GlobalSearchCombobox', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    navigate.mockReset()
    queryClient = new QueryClient()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderCombobox() {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GlobalSearchCombobox />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
  }

  it('navigates to /watch/{id} when a result is selected', () => {
    useCatalogListQuery.mockReturnValue({
      data: [episode(), episode({ id: 'staff-other', title: 'Secret Mitchell', catalog: 'other' })],
      isPending: false,
      isError: false,
    })
    renderCombobox()

    const input = container.querySelector('#riffsync-global-search') as HTMLInputElement
    act(() => {
      setInputValue(input, 'mit')
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })

    const option = container.querySelector('.riffsync-app-shell-search-option-btn') as HTMLButtonElement
    act(() => {
      option.click()
    })

    expect(navigate).toHaveBeenCalledWith('/watch/032-mitchell')
    expect(container.textContent).not.toContain('Secret Mitchell')
  })

  it('announces empty and error states', () => {
    useCatalogListQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('failed'),
    })
    renderCombobox()

    const input = container.querySelector('#riffsync-global-search') as HTMLInputElement
    act(() => {
      setInputValue(input, 'zzz')
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })

    expect(container.textContent).toContain('We could not load the episode catalog right now')
    expect(container.querySelector('.sr-only')?.textContent).toContain(
      'We could not load the episode catalog right now',
    )

    useCatalogListQuery.mockReturnValue({
      data: [episode({ title: 'Unique Title Only' })],
      isPending: false,
      isError: false,
    })
    act(() => root.unmount())
    root = createRoot(container)
    renderCombobox()
    const input2 = container.querySelector('#riffsync-global-search') as HTMLInputElement
    act(() => {
      setInputValue(input2, 'missing')
      input2.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })
    expect(container.textContent).toContain('No matching titles')
    expect(container.querySelector('.sr-only')?.textContent).toContain('No matching titles')
  })

  it('supports combobox keyboard navigation', () => {
    useCatalogListQuery.mockReturnValue({
      data: [
        episode({ id: 'a', title: 'Alpha Movie' }),
        episode({ id: 'b', title: 'Beta Movie' }),
      ],
      isPending: false,
      isError: false,
    })
    renderCombobox()

    const input = container.querySelector('#riffsync-global-search') as HTMLInputElement
    act(() => {
      setInputValue(input, 'movie')
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(input.getAttribute('aria-activedescendant')).toContain('-option-a')

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(navigate).toHaveBeenCalledWith('/watch/a')
  })
})
