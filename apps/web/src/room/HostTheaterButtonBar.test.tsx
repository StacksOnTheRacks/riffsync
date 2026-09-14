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
  participantAvController: null,
  avDisabled: false,
  showAvControls: true,
  onLocalToggleAnnounce: vi.fn(),
  castAvailability: 'available' as const,
  castStartLifecycle: 'idle' as const,
  onCastToTvClick: vi.fn(),
  onLinkTvSubmitCode: vi.fn(),
  onStopLinkTv: vi.fn(),
  linkTvActive: false,
  onStartBroadcast: vi.fn(),
  onStopBroadcast: vi.fn(),
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onCopyShare: vi.fn(),
  shareHint: null,
  partyNameDraft: 'Test Party',
  onPartyNameDraftChange: vi.fn(),
  onOpenSettings: vi.fn(),
  onSavePartyName: vi.fn(),
  partyNameBusy: false,
  partyNameErr: null,
  partyUrl: 'https://www.test.example/room/room-test-1',
  roomVisibility: 'public' as const,
  visibilityBusy: false,
  visibilityErr: null,
  onSelectRoomVisibility: vi.fn(),
  theaterShareQuality: 'balanced' as const,
  onTheaterShareQualityChange: vi.fn(),
  roomMode: 'theater' as const,
  hostBarBusy: false,
  hostBarErr: null,
  onSelectRoomMode: vi.fn(),
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

  it('renders eight default segments with an icon-only mode switcher and Load Media', () => {
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} />)
    })
    const segments = container.querySelectorAll('.riffsync-host-theater-bar__segment')
    expect(segments.length).toBe(8)
    const mode = container.querySelector('[aria-label="Room mode, Watch Party"]') as HTMLButtonElement
    expect(mode).not.toBeNull()
    expect(mode.textContent?.trim()).toBe('')
    expect(container.querySelector('[aria-label="Load media"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Show chat panel"]')).toBeNull()
    expect(container.querySelector('[aria-label="Hide chat panel"]')).toBeNull()
  })

  it('opens an icon-only Watch Party, Video Chat, and Games mode menu', () => {
    const onSelectRoomMode = vi.fn()
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} onSelectRoomMode={onSelectRoomMode} />)
    })
    const mode = container.querySelector('[aria-label="Room mode, Watch Party"]') as HTMLButtonElement
    act(() => mode.click())

    const options = [...container.querySelectorAll('.riffsync-host-theater-bar__mode-option')]
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'Watch Party',
      'Video Chat',
      'Games',
    ])
    expect(options.every((option) => option.textContent?.trim() === '')).toBe(true)
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
    expect(options[2]?.hasAttribute('disabled')).toBe(true)

    act(() => (options[1] as HTMLButtonElement).click())
    expect(onSelectRoomMode).toHaveBeenCalledWith('videoChat')
  })

  it('switches back to Watch Party from Video Chat', () => {
    const onSelectRoomMode = vi.fn()
    act(() => {
      root.render(
        <HostTheaterButtonBar
          {...baseProps}
          roomMode="videoChat"
          onSelectRoomMode={onSelectRoomMode}
        />,
      )
    })
    const mode = container.querySelector('[aria-label="Room mode, Video Chat"]') as HTMLButtonElement
    act(() => mode.click())
    const watchParty = container.querySelector(
      '.riffsync-host-theater-bar__mode-option[aria-label="Watch Party"]',
    ) as HTMLButtonElement
    act(() => watchParty.click())
    expect(onSelectRoomMode).toHaveBeenCalledWith('theater')
  })

  it('starts and stops broadcast from the third segment', () => {
    const onStartBroadcast = vi.fn()
    const onStopBroadcast = vi.fn()
    act(() => {
      root.render(
        <HostTheaterButtonBar
          {...baseProps}
          onStartBroadcast={onStartBroadcast}
          onStopBroadcast={onStopBroadcast}
        />,
      )
    })
    const segments = [...container.querySelectorAll('.riffsync-host-theater-bar__segment')]
    expect(segments[2]?.getAttribute('aria-label')).toBe('Broadcast')
    act(() => (segments[2] as HTMLButtonElement).click())
    expect(onStartBroadcast).toHaveBeenCalled()

    act(() => {
      root.render(
        <HostTheaterButtonBar
          {...baseProps}
          captureActive
          onStartBroadcast={onStartBroadcast}
          onStopBroadcast={onStopBroadcast}
        />,
      )
    })
    const stop = container.querySelector('[aria-label="Stop broadcast"]') as HTMLButtonElement
    act(() => stop.click())
    expect(onStopBroadcast).toHaveBeenCalled()
    expect(container.querySelector('[aria-label="Leave party"]')).toBeNull()
  })

  it('opens Load Media from the second segment', () => {
    const onOpenLoadMedia = vi.fn()
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} onOpenLoadMedia={onOpenLoadMedia} />)
    })
    const segments = [...container.querySelectorAll('.riffsync-host-theater-bar__segment')]
    expect(segments[1]?.getAttribute('aria-label')).toBe('Load media')
    act(() => (segments[1] as HTMLButtonElement).click())
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

  it('opens Watch on TV with /link instructions and a required TV code for Link Smart TV', async () => {
    const onLinkTvSubmitCode = vi.fn()
    const onCastToTvClick = vi.fn()
    act(() => {
      root.render(
        <HostTheaterButtonBar
          {...baseProps}
          onLinkTvSubmitCode={onLinkTvSubmitCode}
          onCastToTvClick={onCastToTvClick}
        />,
      )
    })

    const cast = container.querySelector('[aria-label="Cast to TV"]') as HTMLButtonElement
    act(() => cast.click())

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Watch on TV')
    expect(container.textContent).toContain('/link')
    expect(container.textContent).not.toMatch(/(^|[^/])\/tv(\b|$)/)

    const input = container.querySelector('[name="tvLinkCode"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.required).toBe(true)

    const link = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Link Smart TV',
    ) as HTMLButtonElement
    act(() => link.click())
    expect(onLinkTvSubmitCode).not.toHaveBeenCalled()
    expect(input.validity.valueMissing).toBe(true)

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, 'ABC123')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      const form = container.querySelector('.riffsync-watch-on-tv') as HTMLFormElement
      form.requestSubmit()
    })
    await vi.waitFor(() => {
      expect(onLinkTvSubmitCode).toHaveBeenCalledWith('ABC123')
    })
  })

  it('starts Chromecast from Watch on TV without requiring a TV link code', () => {
    const onCastToTvClick = vi.fn()
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} onCastToTvClick={onCastToTvClick} />)
    })
    act(() => (container.querySelector('[aria-label="Cast to TV"]') as HTMLButtonElement).click())

    const chromecast = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Chromecast',
    ) as HTMLButtonElement
    act(() => chromecast.click())
    expect(onCastToTvClick).toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('renders Settings instead of Share and opens Watch Party Settings', async () => {
    const onOpenSettings = vi.fn()
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} onOpenSettings={onOpenSettings} />)
    })

    expect(container.querySelector('[aria-label="Share watch party"]')).toBeNull()
    expect(container.textContent).not.toContain('Share Watch Party')

    const settings = container.querySelector('[aria-label="Settings"]') as HTMLButtonElement
    expect(settings).not.toBeNull()
    expect(settings.getAttribute('aria-haspopup')).toBe('dialog')
    expect(settings.getAttribute('aria-expanded')).toBe('false')

    act(() => settings.click())
    expect(onOpenSettings).toHaveBeenCalled()
    expect(settings.getAttribute('aria-expanded')).toBe('true')
    expect(settings.getAttribute('aria-pressed')).toBe('true')
    expect(settings.classList.contains('riffsync-host-theater-bar__segment--on')).toBe(true)

    const dialog = container.querySelector('[role="dialog"][aria-labelledby="riffsync-watch-party-settings-title"]')
    expect(dialog).not.toBeNull()
    expect(container.textContent).toContain('Watch Party Settings')
    expect(container.textContent).toContain('Party Name')
    expect(container.textContent).toContain('Party URL')
    expect(container.textContent).toContain('Visibility')
    expect(container.textContent).toContain('Private')
    expect(container.textContent).toContain('Public')
    expect(container.textContent).toContain('Share quality')
    expect(container.textContent).toContain('Balanced (24 fps)')

    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Save')
    const copy = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Copy')
    const close = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Close')
    expect(save).toBeTruthy()
    expect(copy).toBeTruthy()
    expect(close).toBeTruthy()
  })

  it('dismisses Watch Party Settings with Close and Escape and returns focus to Settings', async () => {
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} />)
    })
    const settings = container.querySelector('[aria-label="Settings"]') as HTMLButtonElement
    act(() => settings.click())
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    const close = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Close')!
    act(() => close.click())
    await vi.waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeNull()
    })
    expect(settings.getAttribute('aria-expanded')).toBe('false')
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(settings)
    })

    act(() => settings.click())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await vi.waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeNull()
    })
    expect(settings.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the Help popup titled Host settings', () => {
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} />)
    })
    const help = container.querySelector('[aria-label="Host help and room settings"]') as HTMLButtonElement
    act(() => help.click())
    expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe('Host settings')
  })

  it('closes Watch on TV only after Cast has a session or fails', () => {
    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} />)
    })
    act(() => (container.querySelector('[aria-label="Cast to TV"]') as HTMLButtonElement).click())
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} castStartLifecycle="launching" />)
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      root.render(<HostTheaterButtonBar {...baseProps} castStartLifecycle="session_pending_render" />)
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
