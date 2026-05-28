// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatGiphyPicker } from './ChatGiphyPicker'
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

function renderPicker(el: HTMLElement, onSelect: (result: giphySearchApi.GiphySearchResult) => void): Root {
  const root = createRoot(el)
  act(() => {
    root.render(<ChatGiphyPicker accessToken="token-abc" onSelect={onSelect} />)
  })
  return root
}

describe('ChatGiphyPicker', () => {
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

  it('opens popover and runs debounced search', async () => {
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
    root = renderPicker(container, onSelect)

    const toggle = container.querySelector('.riffsync-room-chat-giphy-toggle') as HTMLButtonElement
    act(() => {
      toggle.click()
    })

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
    expect(container.querySelector('.riffsync-room-chat-giphy-popover')).toBeNull()
  })

  it('dismisses on Escape', () => {
    container = document.createElement('div')
    root = renderPicker(container, vi.fn())

    const toggle = container.querySelector('.riffsync-room-chat-giphy-toggle') as HTMLButtonElement
    act(() => {
      toggle.click()
    })
    expect(container.querySelector('.riffsync-room-chat-giphy-popover')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(container.querySelector('.riffsync-room-chat-giphy-popover')).toBeNull()
  })
})
