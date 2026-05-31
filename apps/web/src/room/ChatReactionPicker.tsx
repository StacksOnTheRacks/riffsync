import { useCallback, useEffect, useId, useRef, useState } from 'react'
import 'emoji-picker-element'

type EmojiClickEvent = CustomEvent<{ unicode: string }>
type PopoverPlacement = 'up' | 'down'

export type ChatReactionPickerProps = {
  onEmojiSelected: (emoji: string) => void
}

export function ChatReactionPicker({ onEmojiSelected }: ChatReactionPickerProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<PopoverPlacement>('up')
  const popoverId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLElement | null>(null)

  const updatePlacement = useCallback(() => {
    const root = rootRef.current
    const toggle = toggleRef.current
    if (!root || !toggle) return

    const chatLog = root.closest('.riffsync-room-chat-log')
    const boundary = chatLog?.getBoundingClientRect()
    const toggleRect = toggle.getBoundingClientRect()
    const topBoundary = boundary?.top ?? 0
    const bottomBoundary = boundary?.bottom ?? window.innerHeight
    const availableAbove = toggleRect.top - topBoundary
    const availableBelow = bottomBoundary - toggleRect.bottom
    const estimatedPopoverHeight = 280

    setPlacement(
      availableAbove < estimatedPopoverHeight && availableBelow > availableAbove ? 'down' : 'up',
    )
  }, [])

  const selectEmoji = useCallback(
    (unicode: string) => {
      onEmojiSelected(unicode)
      setOpen(false)
      toggleRef.current?.focus()
    },
    [onEmojiSelected],
  )

  const toggleOpen = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) updatePlacement()
      return !wasOpen
    })
  }, [updatePlacement])

  useEffect(() => {
    if (!open) return
    const picker = pickerRef.current
    if (!picker) return
    const onEmoji = (event: Event) => {
      const detail = (event as EmojiClickEvent).detail
      if (typeof detail?.unicode === 'string' && detail.unicode.length > 0) {
        selectEmoji(detail.unicode)
      }
    }
    picker.addEventListener('emoji-click', onEmoji)
    return () => picker.removeEventListener('emoji-click', onEmoji)
  }, [open, selectEmoji])

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
    const onReposition = () => updatePlacement()
    window.addEventListener('resize', onReposition)
    document.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      document.removeEventListener('scroll', onReposition, true)
    }
  }, [open, updatePlacement])

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
    <div ref={rootRef} className="riffsync-room-chat-reaction-picker">
      <button
        ref={toggleRef}
        type="button"
        className="riffsync-room-chat-reaction-add gen-button"
        aria-label="Add reaction"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={toggleOpen}
      >
        <span aria-hidden="true">+</span>
      </button>
      {open ? (
        <div
          id={popoverId}
          className={`riffsync-room-chat-emoji-popover riffsync-room-chat-emoji-popover--${placement}`}
          role="dialog"
          aria-label="Reaction emoji picker"
        >
          <emoji-picker ref={pickerRef} className="riffsync-room-chat-emoji-picker" />
        </div>
      ) : null}
    </div>
  )
}
