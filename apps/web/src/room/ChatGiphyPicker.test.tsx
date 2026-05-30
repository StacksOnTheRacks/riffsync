// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatGiphyPickerPanel } from './ChatGiphyPicker'
import * as giphySearchApi from '../api/giphySearchApi'

vi.mock('../api/giphySearchApi', () => ({
  searchGiphy: vi.fn(),
}))

const searchGiphyMock = vi.mocked(giphySearchApi.searchGiphy)

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPanel(
  el: HTMLElement,
  onSelect: (result: giphySearchApi.GiphySearchResult) => void,
  active = true,
): Root {
  const root = createRoot(el)
  act(() => {
    root.render(<ChatGiphyPickerPanel accessToken="token-abc" onSelect={onSelect} active={active} />)
  })
  return root
}

describe('ChatGiphyPickerPanel', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    searchGiphyMock.mockReset()
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
    vi.useRealTimers()
  })

  it('runs debounced search when active', async () => {
    searchGiphyMock.mockResolvedValue({
      results: [
        {
          giphyId: 'gif-1',
          previewUrl: 'https://media0.giphy.com/media/gif-1/p.gif',
          renditionUrl: 'https://media0.giphy.com/media/gif-1/r.gif',
          title: 'Wave',
        },
      ],
    })

    container = document.createElement('div')
    const onSelect = vi.fn()
    root = renderPanel(container, onSelect)

    const search = container.querySelector('.riffsync-room-chat-giphy-search') as HTMLInputElement
    act(() => {
      setInputValue(search, 'wave')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchGiphyMock).toHaveBeenCalledWith('token-abc', { q: 'wave', limit: 20 })

    const resultBtn = container.querySelector('.riffsync-room-chat-giphy-result') as HTMLButtonElement
    act(() => {
      resultBtn.click()
    })

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ giphyId: 'gif-1', renditionUrl: expect.stringContaining('gif-1') }),
    )
  })

  it('does not search when inactive', async () => {
    container = document.createElement('div')
    root = renderPanel(container, vi.fn(), false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchGiphyMock).not.toHaveBeenCalled()
  })
})
