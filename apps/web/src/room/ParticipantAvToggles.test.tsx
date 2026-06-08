// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParticipantAvToggles } from './ParticipantAvToggles'
import { PARTICIPANT_AV_DISABLED_COPY } from './participantAvErrorCopy'
import { createParticipantAvController } from './sfu/participantAvSession'

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
    sfuRoomErr?: string | null
  } = {}) {
    const controller = createParticipantAvController({
      canPublish: () => opts.canPublish ?? true,
    })
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={opts.avDisabled ?? false}
          sfuRoomErr={opts.sfuRoomErr ?? null}
          onLocalToggleAnnounce={vi.fn()}
        />,
      )
    })
    return controller
  }

  it('renders camera and microphone controls for signed-in session chrome', () => {
    renderToggles()
    expect(container.querySelector('.riffsync-room-av-toggle')).not.toBeNull()
    expect(container.textContent).toContain('Camera')
    expect(container.textContent).toContain('Microphone')
  })

  it('does not render when parent omits toggles for guests (signed-in guard)', () => {
    const fanToken: string | null = null
    act(() => {
      root.render(
        fanToken ? (
          <ParticipantAvToggles
            controller={createParticipantAvController({ canPublish: () => false })}
            avDisabled={false}
            sfuRoomErr={null}
            onLocalToggleAnnounce={vi.fn()}
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
    }
    act(() => {
      root.render(
        <ParticipantAvToggles
          controller={controller}
          avDisabled={false}
          sfuRoomErr={null}
          onLocalToggleAnnounce={vi.fn()}
        />,
      )
    })
    const buttons = container.querySelectorAll('button.riffsync-room-av-toggle')
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false')
  })
})
