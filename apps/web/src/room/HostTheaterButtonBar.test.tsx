// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostTheaterButtonBar } from './HostTheaterButtonBar'

const baseProps = {
  extensionPresent: false,
  mediaTabOpen: false,
  mediaPlaybackControllable: false,
  captureActive: false,
  transportBusy: false,
  onOpenLoadMedia: vi.fn(),
  onToggleChatRail: vi.fn(),
  chatRailOpen: true,
  onLeave: vi.fn(),
  participantAvController: null,
  avDisabled: false,
  showAvControls: true,
  onLocalToggleAnnounce: vi.fn(),
  castAvailability: 'available' as const,
  castStartLifecycle: 'idle' as const,
  onCastToTvClick: vi.fn(),
  onLinkTvClick: vi.fn(),
  linkTvActive: false,
  onStartBroadcast: vi.fn(),
  onStopBroadcast: vi.fn(),
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onCopyShare: vi.fn(),
  shareHint: null,
  onOpenRenameModal: vi.fn(),
  roomVisibility: 'public' as const,
  visibilityBusy: false,
  visibilityErr: null,
  onSelectRoomVisibility: vi.fn(),
  roomMode: 'theater' as const,
  hostBarBusy: false,
  hostBarErr: null,
  onSelectRoomMode: vi.fn(),
  onToggleAvDisabled: vi.fn(),
}

describe('HostTheaterButtonBar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders eight default segments including Load Media', () => {
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} />)
    })
    const segments = container.querySelectorAll('.riffsync-host-theater-bar__segment')
    expect(segments.length).toBe(8)
    expect(container.querySelector('[aria-label="Load media"]')).not.toBeNull()
  })

  it('opens Load Media handler from the left segment', () => {
    const onOpenLoadMedia = vi.fn()
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} onOpenLoadMedia={onOpenLoadMedia} />)
    })
    const loadMedia = container.querySelector('[aria-label="Load media"]') as HTMLButtonElement
    act(() => loadMedia.click())
    expect(onOpenLoadMedia).toHaveBeenCalled()
  })

  it('adds play and pause segments when extension media tab is open', () => {
    act(() => {
      root.render(
        <HostTheaterButtonBar
          {...baseProps}
          extensionPresent
          mediaTabOpen
          mediaPlaybackControllable
        />,
      )
    })
    const segments = container.querySelectorAll('.riffsync-host-theater-bar__segment')
    expect(segments.length).toBe(10)
    expect(container.querySelector('[aria-label="Play"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Pause"]')).not.toBeNull()
  })
})
