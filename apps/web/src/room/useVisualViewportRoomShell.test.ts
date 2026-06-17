// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  KEYBOARD_HEIGHT_DELTA_THRESHOLD_PX,
  buildVisualViewportShellStyle,
  computeVisualViewportShellState,
  containRoomTextInputFocus,
  isRoomTextInput,
} from './useVisualViewportRoomShell'

describe('computeVisualViewportShellState', () => {
  it('returns empty vars when visualViewport is unavailable', () => {
    expect(computeVisualViewportShellState(null, 800, true)).toEqual({
      keyboardOpen: false,
      cssVars: {},
    })
  })

  it('returns empty vars when narrow fix is disabled', () => {
    expect(
      computeVisualViewportShellState({ height: 400, width: 390, offsetTop: 120, offsetLeft: 0 }, 800, false),
    ).toEqual({
      keyboardOpen: false,
      cssVars: {},
    })
  })

  it('detects keyboard open when visual viewport height shrinks', () => {
    const state = computeVisualViewportShellState(
      { height: 420, width: 390, offsetTop: 80, offsetLeft: 0 },
      800,
      true,
    )
    expect(state.keyboardOpen).toBe(true)
    expect(state.cssVars['--riffsync-vv-height']).toBe('420px')
    expect(state.cssVars['--riffsync-vv-offset-top']).toBe('80px')
    expect(state.cssVars['--riffsync-room-stage-max-height']).toBe(
      'calc(420px - var(--riffsync-room-chrome-height))',
    )
  })

  it('treats small layout deltas as keyboard closed', () => {
    const layoutHeight = 800
    const state = computeVisualViewportShellState(
      {
        height: layoutHeight - KEYBOARD_HEIGHT_DELTA_THRESHOLD_PX,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
      },
      layoutHeight,
      true,
    )
    expect(state.keyboardOpen).toBe(false)
    expect(state.cssVars['--riffsync-vv-height']).toBe(`${layoutHeight - KEYBOARD_HEIGHT_DELTA_THRESHOLD_PX}px`)
  })
})

describe('buildVisualViewportShellStyle', () => {
  it('maps css vars to style object', () => {
    expect(
      buildVisualViewportShellStyle({
        keyboardOpen: true,
        cssVars: { '--riffsync-vv-height': '420px' },
      }),
    ).toEqual({ '--riffsync-vv-height': '420px' })
  })
})

describe('isRoomTextInput', () => {
  it('matches native text controls used on the room page', () => {
    const input = document.createElement('input')
    input.type = 'text'
    expect(isRoomTextInput(input)).toBe(true)

    const textarea = document.createElement('textarea')
    expect(isRoomTextInput(textarea)).toBe(true)

    const button = document.createElement('button')
    expect(isRoomTextInput(button)).toBe(false)

    input.type = 'checkbox'
    expect(isRoomTextInput(input)).toBe(false)
  })
})

describe('containRoomTextInputFocus', () => {
  it('resets document scroll offsets', () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    document.documentElement.scrollTop = 40
    document.body.scrollTop = 40

    containRoomTextInputFocus()

    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    expect(document.documentElement.scrollTop).toBe(0)
    expect(document.body.scrollTop).toBe(0)

    vi.unstubAllGlobals()
  })
})
