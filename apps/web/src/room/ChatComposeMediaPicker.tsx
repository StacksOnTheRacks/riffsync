import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { GiphySearchResult } from '../api/giphySearchApi'
import { ChatEmojiPickerPanel } from './ChatEmojiPicker'
import { ChatGiphyPickerPanel } from './ChatGiphyPicker'

type MediaTab = 'emoji' | 'giphy'

export type ChatComposeMediaPickerProps = {
  draft: string
  onDraftChange: (next: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  accessToken: string
  onGifSelect: (result: GiphySearchResult) => void
}

export function ChatComposeMediaPicker({
  draft,
  onDraftChange,
  inputRef,
  accessToken,
  onGifSelect,
}: ChatComposeMediaPickerProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<MediaTab>('emoji')
  const popoverId = useId()
  const emojiTabId = useId()
  const giphyTabId = useId()
  const emojiPanelId = useId()
  const giphyPanelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setTab('emoji')
    toggleRef.current?.focus()
  }, [])

  const handleToggle = () => {
    setOpen((was) => {
      if (was) setTab('emoji')
      return !was
    })
  }

  const handleGifSelect = (result: GiphySearchResult) => {
    onGifSelect(result)
    close()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root || !(event.target instanceof Node)) return
      if (!root.contains(event.target)) {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close, open])

  return (
    <div ref={rootRef} className="riffsync-room-chat-media">
      <button
        ref={toggleRef}
        type="button"
        className="riffsync-room-chat-media-toggle gen-button"
        aria-label="Insert emoji or GIF"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={handleToggle}
      >
        <span aria-hidden="true">😀</span>
      </button>
      {open ? (
        <div
          id={popoverId}
          className="riffsync-room-chat-media-popover"
          role="dialog"
          aria-label="Emoji and GIF picker"
        >
          <div className="riffsync-room-chat-media-tabs" role="tablist" aria-label="Picker type">
            <button
              id={emojiTabId}
              type="button"
              role="tab"
              className={`riffsync-room-chat-media-tab${tab === 'emoji' ? ' riffsync-room-chat-media-tab--on' : ''}`}
              aria-selected={tab === 'emoji'}
              aria-controls={emojiPanelId}
              onClick={() => setTab('emoji')}
            >
              Emojis
            </button>
            <button
              id={giphyTabId}
              type="button"
              role="tab"
              className={`riffsync-room-chat-media-tab${tab === 'giphy' ? ' riffsync-room-chat-media-tab--on' : ''}`}
              aria-selected={tab === 'giphy'}
              aria-controls={giphyPanelId}
              onClick={() => setTab('giphy')}
            >
              GIF
            </button>
          </div>
          <div className="riffsync-room-chat-media-body">
            <div
              id={emojiPanelId}
              role="tabpanel"
              className="riffsync-room-chat-media-panel riffsync-room-chat-media-panel--emoji"
              aria-labelledby={emojiTabId}
              hidden={tab !== 'emoji'}
            >
              <ChatEmojiPickerPanel
                draft={draft}
                onDraftChange={onDraftChange}
                inputRef={inputRef}
                active={tab === 'emoji'}
              />
            </div>
            <div
              id={giphyPanelId}
              role="tabpanel"
              className="riffsync-room-chat-media-panel riffsync-room-chat-media-panel--giphy"
              aria-labelledby={giphyTabId}
              hidden={tab !== 'giphy'}
            >
              <ChatGiphyPickerPanel
                accessToken={accessToken}
                onSelect={handleGifSelect}
                active={tab === 'giphy'}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
