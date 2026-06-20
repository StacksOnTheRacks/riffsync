// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatComposeMediaPicker } from './ChatComposeMediaPicker'
import * as giphySearchApi from '../api/giphySearchApi'

vi.mock('../api/giphySearchApi', () => ({
  searchGiphy: vi.fn(),
}))

vi.mock('emoji-picker-element', () => ({}))

const searchGiphyMock = vi.mocked(giphySearchApi.searchGiphy)

function cssRule(selector: string): string {
  const css = readFileSync(join(process.cwd(), 'src/styles/riffsync-app.css'), 'utf8')
  return css.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{[^}]+\\}`))?.[0] ?? ''
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPicker(
  el: HTMLElement,
  props: {
    onGifSelect: (result: giphySearchApi.GiphySearchResult) => void
    onDraftChange?: (next: string) => void
  },
): Root {
  const inputRef = { current: document.createElement('input') as HTMLInputElement }
  const root = createRoot(el)
  act(() => {
    root.render(
      <ChatComposeMediaPicker
        draft=""
        onDraftChange={props.onDraftChange ?? vi.fn()}
        inputRef={inputRef}
        accessToken="token-abc"
        onGifSelect={props.onGifSelect}
      />,
    )
  })
  return root
}

describe('ChatComposeMediaPicker', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    searchGiphyMock.mockReset()
    if (!customElements.get('emoji-picker')) {
      customElements.define('emoji-picker', class extends HTMLElement {})
    }
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
    vi.useRealTimers()
  })

  it('opens popover with emoji tab selected by default', () => {
    container = document.createElement('div')
    root = renderPicker(container, { onGifSelect: vi.fn() })

    const toggle = container.querySelector('.riffsync-room-chat-media-toggle') as HTMLButtonElement
    act(() => {
      toggle.click()
    })

    expect(container.querySelector('.riffsync-room-chat-media-popover')).not.toBeNull()
    const emojiTab = container.querySelector('.riffsync-room-chat-media-tab') as HTMLButtonElement
    expect(emojiTab.textContent).toBe('Emojis')
    expect(emojiTab.getAttribute('aria-selected')).toBe('true')
    const body = container.querySelector('.riffsync-room-chat-media-body')
    expect(body?.querySelector('.riffsync-room-chat-media-panel--emoji')).not.toBeNull()
    expect(body?.querySelector('.riffsync-room-chat-media-panel--giphy')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-chat-emoji-picker')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-chat-media-panel--giphy')?.hasAttribute('hidden')).toBe(true)
  })

  it('keeps picker tab body fixed while Giphy results scroll internally', () => {
    const bodyRule = cssRule('.riffsync-room-chat-media-body')
    const panelRule = cssRule('.riffsync-room-chat-media-panel')
    const giphyPanelRule = cssRule('.riffsync-room-chat-media-panel--giphy')
    const resultsRule = cssRule('.riffsync-room-chat-giphy-results')

    expect(bodyRule).toContain('height: 16.5rem;')
    expect(bodyRule).toContain('flex: 0 0 16.5rem;')
    expect(bodyRule).toContain('overflow: hidden;')
    expect(panelRule).toContain('height: 100%;')
    expect(giphyPanelRule).toContain('overflow: hidden;')
    expect(resultsRule).toContain('overflow: auto;')
    expect(resultsRule).toContain('min-height: 0;')
  })

  it('switches to GIF tab and runs debounced search', async () => {
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
    const onGifSelect = vi.fn()
    root = renderPicker(container, { onGifSelect })

    const toggle = container.querySelector('.riffsync-room-chat-media-toggle') as HTMLButtonElement
    act(() => {
      toggle.click()
    })

    const tabs = container.querySelectorAll('.riffsync-room-chat-media-tab')
    act(() => {
      ;(tabs[1] as HTMLButtonElement).click()
    })

    const search = container.querySelector('.riffsync-room-chat-giphy-search') as HTMLInputElement
    expect(search).not.toBeNull()

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

    expect(onGifSelect).toHaveBeenCalledWith(
      expect.objectContaining({ giphyId: 'gif-1', renditionUrl: expect.stringContaining('gif-1') }),
    )
    expect(container.querySelector('.riffsync-room-chat-media-popover')).toBeNull()
  })

  it('dismisses on Escape', () => {
    container = document.createElement('div')
    root = renderPicker(container, { onGifSelect: vi.fn() })

    const toggle = container.querySelector('.riffsync-room-chat-media-toggle') as HTMLButtonElement
    act(() => {
      toggle.click()
    })
    expect(container.querySelector('.riffsync-room-chat-media-popover')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(container.querySelector('.riffsync-room-chat-media-popover')).toBeNull()
  })
})
