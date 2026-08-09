// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParticipantAvToggles } from './ParticipantAvToggles'
import { RIFFSYNC_AV_TOGGLE_STATUS_ID } from './drawerErrorPresentation'
import { PARTICIPANT_AV_DISABLED_COPY } from './participantAvErrorCopy'
import { createParticipantAvController } from './sfu/participantAvSession'

const defaultTvProps = {
  showAvControls: true,
  castAvailability: 'available' as const,
  castStartLifecycle: 'idle' as const,
  onCastToTvClick: vi.fn(),
  onLinkTvClick: vi.fn(),
  linkTvActive: false,
}

describe('ParticipantAvToggles', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderToggles(opts: {
    avDisabled?: boolean
    canPublish?: boolean
  } = {}) {
    const controller = createParticipantAvController({
      canPublish: () => opts.canPublish ?? true,
    })
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={opts.avDisabled ?? false}
          onLocalToggleAnnounce={vi.fn()}
          {...defaultTvProps}
        />,
      )
    })
    return controller
  }

  it('renders camera and microphone controls for signed-in session chrome', () => {
    renderToggles()
    expect(container.querySelector('.riffsync-room-av-toggle')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Camera"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Microphone"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="room-av-cast-button"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="room-av-link-tv-button"]')).not.toBeNull()
  })

  it('does not render when parent omits toggles for guests (signed-in guard)', () => {
    const fanToken: string | null = null
    act(() => {
      root.render(
        fanToken ? (
          <ParticipantAvToggles
            controller={createParticipantAvController({ canPublish: () => false })}
            avDisabled={false}
            onLocalToggleAnnounce={vi.fn()}
            {...defaultTvProps}
          />
        ) : null,
      )
    })
    expect(container.querySelector('.riffsync-room-av')).toBeNull()
  })

  it('shows kill-switch copy and blocks activation when avDisabled', () => {
    renderToggles({ avDisabled: true, canPublish: false })
    expect(container.textContent).toContain(PARTICIPANT_AV_DISABLED_COPY)
    const killSwitch = container.querySelector('.riffsync-room-av__kill-switch')
    const camera = container.querySelector(
      'button.riffsync-room-av-toggle',
    ) as HTMLButtonElement
    expect(camera.getAttribute('aria-disabled')).toBe('true')
    expect(camera.getAttribute('aria-describedby')).toBe(killSwitch?.id)
    expect(killSwitch?.getAttribute('aria-live')).toBeNull()
  })

  it('shows inline error copy with aria-describedby on toggles', () => {
    const controller = {
      getState: () => ({
        cameraEnabled: false,
        micEnabled: false,
        micMuted: false,
        canPublish: true,
        needsProducerToken: false,
        error: 'publisher_cap_exceeded' as const,
        busy: false,
      }),
      subscribe: () => () => undefined,
      getLocalPreviewStream: () => null,
      refreshPublishGate: vi.fn(),
      attachSession: vi.fn(),
      resetOnReconnect: vi.fn(),
      teardownPublishing: vi.fn(),
      enableCamera: vi.fn(),
      disableCamera: vi.fn(),
      enableMic: vi.fn(),
      disableMic: vi.fn(),
      toggleMicMute: vi.fn(),
      failPublish: vi.fn(),
      clearError: vi.fn(),
    }
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={false}
          onLocalToggleAnnounce={vi.fn()}
          {...defaultTvProps}
        />,
      )
    })
    const err = container.querySelector(`#${RIFFSYNC_AV_TOGGLE_STATUS_ID}`)
    expect(err?.getAttribute('role')).toBe('status')
    expect(err?.getAttribute('aria-live')).toBe('polite')
    expect(err?.textContent).toContain('maximum number of live')
    const camera = container.querySelector('button.riffsync-room-av-toggle') as HTMLButtonElement
    expect(camera.getAttribute('aria-describedby')).toContain(RIFFSYNC_AV_TOGGLE_STATUS_ID)
  })

  it('announces local camera toggle via callback', () => {
    const onLocalToggleAnnounce = vi.fn()
    const controller = {
      getState: () => ({
        cameraEnabled: true,
        micEnabled: false,
        micMuted: false,
        canPublish: true,
        needsProducerToken: false,
        error: null,
        busy: false,
      }),
      subscribe: () => () => undefined,
      getLocalPreviewStream: () => null,
      refreshPublishGate: vi.fn(),
      attachSession: vi.fn(),
      resetOnReconnect: vi.fn(),
      teardownPublishing: vi.fn(),
      enableCamera: vi.fn(),
      disableCamera: vi.fn(),
      enableMic: vi.fn(),
      disableMic: vi.fn(),
      toggleMicMute: vi.fn(),
      failPublish: vi.fn(),
      clearError: vi.fn(),
    }
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={false}
          onLocalToggleAnnounce={onLocalToggleAnnounce}
          {...defaultTvProps}
        />,
      )
    })
    const camera = container.querySelector('button.riffsync-room-av-toggle') as HTMLButtonElement
    act(() => {
      camera.click()
    })
    expect(onLocalToggleAnnounce).toHaveBeenCalledWith('Camera off')
    expect(controller.disableCamera).toHaveBeenCalled()
  })

  it('announces local microphone toggle via callback', async () => {
    const onLocalToggleAnnounce = vi.fn()
    let micEnabled = false
    const controller = {
      getState: () => ({
        cameraEnabled: false,
        micEnabled,
        micMuted: false,
        canPublish: true,
        needsProducerToken: false,
        error: null,
        busy: false,
      }),
      subscribe: () => () => undefined,
      getLocalPreviewStream: () => null,
      refreshPublishGate: vi.fn(),
      attachSession: vi.fn(),
      resetOnReconnect: vi.fn(),
      teardownPublishing: vi.fn(),
      enableCamera: vi.fn(),
      disableCamera: vi.fn(),
      enableMic: vi.fn(async () => {
        micEnabled = true
      }),
      disableMic: vi.fn(),
      toggleMicMute: vi.fn(),
      failPublish: vi.fn(),
      clearError: vi.fn(),
    }
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={false}
          onLocalToggleAnnounce={onLocalToggleAnnounce}
          {...defaultTvProps}
        />,
      )
    })
    const mic = container.querySelector('button[aria-label="Microphone"]') as HTMLButtonElement
    await act(async () => {
      mic.click()
      await Promise.resolve()
    })
    expect(onLocalToggleAnnounce).toHaveBeenCalledWith('Microphone on')
  })

  it('reflects aria-pressed for local camera and microphone state', () => {
    const controller = {
      getState: () => ({
        cameraEnabled: true,
        micEnabled: false,
        micMuted: false,
        canPublish: true,
        needsProducerToken: true,
        error: null,
        busy: false,
      }),
      subscribe: () => () => undefined,
      getLocalPreviewStream: () => null,
      refreshPublishGate: vi.fn(),
      attachSession: vi.fn(),
      resetOnReconnect: vi.fn(),
      teardownPublishing: vi.fn(),
      enableCamera: vi.fn(),
      disableCamera: vi.fn(),
      enableMic: vi.fn(),
      disableMic: vi.fn(),
      toggleMicMute: vi.fn(),
      failPublish: vi.fn(),
      clearError: vi.fn(),
    }
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={false}
          onLocalToggleAnnounce={vi.fn()}
          {...defaultTvProps}
        />,
      )
    })
    const camera = container.querySelector('button[aria-label="Camera"]')
    const mic = container.querySelector('button[aria-label="Microphone"]')
    expect(camera?.getAttribute('aria-pressed')).toBe('true')
    expect(mic?.getAttribute('aria-pressed')).toBe('false')
  })
})
