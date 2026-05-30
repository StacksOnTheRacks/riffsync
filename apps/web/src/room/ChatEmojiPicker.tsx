import { useCallback, useEffect, useRef } from 'react'
import 'emoji-picker-element'
import { insertTextAtCaret } from './insertTextAtCaret'

const CHAT_TEXT_MAX_LEN = 2000

type EmojiClickEvent = CustomEvent<{ unicode: string }>

export type ChatEmojiPickerPanelProps = {
  draft: string
  onDraftChange: (next: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  maxLength?: number
  active?: boolean
}

export function ChatEmojiPickerPanel({
  draft,
  onDraftChange,
  inputRef,
  maxLength = CHAT_TEXT_MAX_LEN,
  active = true,
}: ChatEmojiPickerPanelProps) {
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
    if (!active) return
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
  }, [applyEmoji, active])

  return <emoji-picker ref={pickerRef} className="riffsync-room-chat-emoji-picker" />
}
