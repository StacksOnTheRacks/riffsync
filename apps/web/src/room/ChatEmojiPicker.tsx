import { useCallback, useEffect, useId, useRef, useState } from 'react'
import 'emoji-picker-element'
import { insertTextAtCaret } from './insertTextAtCaret'

const CHAT_TEXT_MAX_LEN = 2000

type EmojiClickEvent = CustomEvent<{ unicode: string }>

export type ChatEmojiPickerProps = {
  draft: string
  onDraftChange: (next: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  maxLength?: number
}

export function ChatEmojiPicker({
  draft,
  onDraftChange,
  inputRef,
  maxLength = CHAT_TEXT_MAX_LEN,
}: ChatEmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const popoverId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLElement | null>(null)

  const applyEmoji = useCallback(
    (unicode: string) => {
      const input = inputRef.current
      const { value, caret } = insertTextAtCaret(
        draft,
        unicode,
        input?.selectionStart ?? null,
        input?.selectionEnd ?? null,
        maxLength,
      )
      onDraftChange(value)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(caret, caret)
      })
    },
    [draft, inputRef, maxLength, onDraftChange],
  )

  useEffect(() => {
    if (!open) return
    const picker = pickerRef.current
    if (!picker) return
    const onEmoji = (event: Event) => {
      const detail = (event as EmojiClickEvent).detail
      if (typeof detail?.unicode === 'string' && detail.unicode.length > 0) {
        applyEmoji(detail.unicode)
      }
    }
    picker.addEventListener('emoji-click', onEmoji)
    return () => picker.removeEventListener('emoji-click', onEmoji)
  }, [applyEmoji, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root || !(event.target instanceof Node)) return
      if (!root.contains(event.target)) {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="riffsync-room-chat-emoji">
      <button
        ref={toggleRef}
        type="button"
        className="riffsync-room-chat-emoji-toggle gen-button"
        aria-label="Insert emoji"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">😀</span>
      </button>
      {open ? (
        <div
          id={popoverId}
          className="riffsync-room-chat-emoji-popover"
          role="dialog"
          aria-label="Emoji picker"
        >
          <emoji-picker ref={pickerRef} className="riffsync-room-chat-emoji-picker" />
        </div>
      ) : null}
    </div>
  )
}
