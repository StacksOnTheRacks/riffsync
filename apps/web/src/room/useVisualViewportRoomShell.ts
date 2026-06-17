import { useEffect, useMemo, useState, type CSSProperties } from 'react'

export const NARROW_ROOM_LAYOUT_MQ = '(max-width: 991px)'
export const KEYBOARD_HEIGHT_DELTA_THRESHOLD_PX = 50

export type VisualViewportLike = {
  height: number
  width: number
  offsetTop: number
  offsetLeft: number
}

export type VisualViewportShellState = {
  keyboardOpen: boolean
  cssVars: Record<string, string>
}

export function computeVisualViewportShellState(
  vv: VisualViewportLike | null | undefined,
  layoutHeight: number,
  applyNarrowFix: boolean,
): VisualViewportShellState {
  if (!vv || !applyNarrowFix) {
    return {
      keyboardOpen: false,
      cssVars: {},
    }
  }

  const heightPx = `${Math.round(vv.height)}px`
  const offsetTopPx = `${Math.round(vv.offsetTop)}px`
  const keyboardOpen = vv.height < layoutHeight - KEYBOARD_HEIGHT_DELTA_THRESHOLD_PX

  return {
    keyboardOpen,
    cssVars: {
      '--riffsync-vv-height': heightPx,
      '--riffsync-vv-offset-top': offsetTopPx,
      '--riffsync-room-stage-max-height': `calc(${heightPx} - var(--riffsync-room-chrome-height))`,
    },
  }
}

export function buildVisualViewportShellStyle(state: VisualViewportShellState): CSSProperties {
  return state.cssVars as CSSProperties
}

export function isRoomTextInput(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    const type = el.type
    return (
      type === 'text' ||
      type === 'search' ||
      type === 'email' ||
      type === 'url' ||
      type === 'tel' ||
      type === 'password' ||
      type === 'number'
    )
  }
  return false
}

export function containRoomTextInputFocus(): void {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

function readVisualViewportSnapshot(): VisualViewportLike | null {
  const vv = window.visualViewport
  if (!vv) return null
  return {
    height: vv.height,
    width: vv.width,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
  }
}

export function useVisualViewportRoomShell(enabled: boolean): {
  style: CSSProperties
  className: string
} {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(NARROW_ROOM_LAYOUT_MQ).matches
  })
  const [layoutHeight, setLayoutHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0,
  )
  const [vvSnapshot, setVvSnapshot] = useState<VisualViewportLike | null>(() =>
    typeof window !== 'undefined' ? readVisualViewportSnapshot() : null,
  )

  useEffect(() => {
    if (!enabled) return
    const mq = window.matchMedia(NARROW_ROOM_LAYOUT_MQ)
    const onMq = () => setNarrow(mq.matches)
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const vv = window.visualViewport
    if (!vv) return

    const sync = () => {
      const nextLayoutHeight = window.innerHeight
      const nextSnapshot = readVisualViewportSnapshot()
      setLayoutHeight(nextLayoutHeight)
      setVvSnapshot(nextSnapshot)
      if (
        narrow &&
        nextSnapshot &&
        nextSnapshot.height < nextLayoutHeight - KEYBOARD_HEIGHT_DELTA_THRESHOLD_PX
      ) {
        containRoomTextInputFocus()
      }
    }

    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [enabled, narrow])

  useEffect(() => {
    if (!enabled || !narrow) return
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!target.closest('.riffsync-site--room')) return
      if (!isRoomTextInput(target)) return
      containRoomTextInputFocus()
    }
    document.addEventListener('focusin', onFocusIn, true)
    return () => document.removeEventListener('focusin', onFocusIn, true)
  }, [enabled, narrow])

  const state = useMemo(
    () => computeVisualViewportShellState(vvSnapshot, layoutHeight, enabled && narrow),
    [vvSnapshot, layoutHeight, enabled, narrow],
  )

  return {
    style: buildVisualViewportShellStyle(state),
    className: state.keyboardOpen ? ' riffsync-site--room-vv-keyboard' : '',
  }
}
