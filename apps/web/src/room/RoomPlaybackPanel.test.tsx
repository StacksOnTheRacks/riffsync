// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RoomPlaybackPanel } from './RoomPlaybackPanel'
import { RIFFSYNC_VIDEO_RELAY_STATUS_ID } from './drawerErrorPresentation'

const baseProps = {
  captureStream: null,
  captureErr: null,
  patchErr: null,
  renameModalOpen: false,
  guestRemote: null,
  fanToken: null,
  theaterPlaybackSnapshot: {
    guestShareFsm: 'idle' as const,
    guestPlayHint: false,
    hostCapturePlayHint: false,
  },
  theaterAudioStatus: null,
  bindHostCaptureVideo: () => undefined,
  bindGuestVideo: () => undefined,
  playHostCapturePreview: async () => undefined,
  playGuestVideo: async () => undefined,
  startCapture: async () => undefined,
  openCapturePlayerTab: () => undefined,
}

describe('RoomPlaybackPanel guest #riffsync-video-relay-status (#210)', () => {
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

  function renderGuest(overrides: Partial<typeof baseProps & { videoRelayStatus: string | null }> = {}) {
    act(() => {
      root.render(
        <RoomPlaybackPanel
          isPublisher={false}
          videoRelayStatus={overrides.videoRelayStatus ?? 'Waiting for host to share…'}
          {...baseProps}
          {...overrides}
        />,
      )
    })
  }

  function videoRelayStatusEl() {
    return container.querySelector(`#${RIFFSYNC_VIDEO_RELAY_STATUS_ID}`)
  }

  it('guest status line exposes stable id and role="status" when copy is present', () => {
    renderGuest({ videoRelayStatus: 'Waiting for host to share…' })

    const el = videoRelayStatusEl()
    expect(el).not.toBeNull()
    expect(el?.id).toBe('riffsync-video-relay-status')
    expect(el?.getAttribute('role')).toBe('status')
    expect(el?.classList.contains('riffsync-muted')).toBe(true)
  })

  it('omits #riffsync-video-relay-status when guest copy is null', () => {
    renderGuest({ videoRelayStatus: null })

    expect(videoRelayStatusEl()).toBeNull()
  })

  it('does not render retired guest not-sharing placeholder when idle FSM copy is shown (#211)', () => {
    renderGuest({ videoRelayStatus: 'Waiting for host to share…', guestRemote: null })

    expect(container.textContent).not.toContain('The host is not sharing video right now.')
    expect(container.querySelector('.riffsync-room-page__guest-video-placeholder')).toBeNull()
  })

  it('does not regress host captureErr alerts when guest path is inactive', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <RoomPlaybackPanel
            {...baseProps}
            isPublisher
            videoRelayStatus={null}
            captureErr="Screen capture failed."
          />
        </MemoryRouter>,
      )
    })

    expect(videoRelayStatusEl()).toBeNull()
    expect(container.querySelector('.riffsync-room-page__host-feedback-alert')?.textContent).toBe(
      'Screen capture failed.',
    )
  })
})

describe('RoomPlaybackPanel host video-relay status (#210)', () => {
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

  it('host status line uses share-status styling and stable id when copy is present', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <RoomPlaybackPanel
            isPublisher
            videoRelayStatus="Video relay reconnecting…"
            {...baseProps}
          />
        </MemoryRouter>,
      )
    })

    const el = container.querySelector(`#${RIFFSYNC_VIDEO_RELAY_STATUS_ID}`)
    expect(el).not.toBeNull()
    expect(el?.getAttribute('role')).toBe('status')
    expect(el?.classList.contains('riffsync-room-page__share-status')).toBe(true)
    expect(el?.classList.contains('riffsync-muted')).toBe(false)
  })
})
