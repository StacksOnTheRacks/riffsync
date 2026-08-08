// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CastReceiverPresentation } from './CastReceiverPresentation'
import { CAST_RECEIVER_COPY } from './castReceiverCopy'
import type { CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECEIVER_VIEWPORTS = [
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
  { label: '3840x2160', width: 3840, height: 2160 },
] as const

describe('CastReceiverPresentation', () => {
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

  function renderPresentation(
    snapshot: CastPresentationSnapshot | null,
    chatMessages = snapshot?.chatOverlay.messages ?? [],
    liveStream: MediaStream | null = null,
  ) {
    act(() => {
      root.render(<CastReceiverPresentation snapshot={snapshot} chatMessages={chatMessages} liveStream={liveStream} />)
    })
  }

  const youtubeSnapshot: CastPresentationSnapshot = {
    snapshotId: 'snap-youtube-1',
    roomMode: 'theater',
    stagePrimary: {
      kind: 'youtube_embed',
      youtubeVideoId: 'abc123',
      label: 'Party video',
    },
    chatOverlay: {
      messages: [{ id: 'm1', kind: 'text', text: 'Fan: hello', senderLabel: 'Fan' }],
    },
  }

  it('shows waiting copy before the first sender snapshot', () => {
    renderPresentation(null)
    expect(container.textContent).toContain(CAST_RECEIVER_COPY.waitingForPresentation)
  })

  it('renders stage-primary video and chat overlay from sender snapshot', () => {
    renderPresentation(youtubeSnapshot)
    expect(container.querySelector('[data-testid="cast-receiver-stage-primary"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="cast-receiver-chat-overlay"]')).not.toBeNull()
    expect(container.textContent).toContain('Fan: hello')
    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('abc123')
  })

  it('keeps empty chat overlay quiet when chat messages are absent', () => {
    renderPresentation(youtubeSnapshot, [])
    expect(container.querySelector('[data-testid="cast-receiver-chat-overlay"]')).not.toBeNull()
    expect(container.querySelector('.riffsync-cast-receiver__chat-log')).not.toBeNull()
    expect(container.textContent).not.toContain('Chat will appear here.')
  })

  it('renders multiple chat lines and scrolls the TV overlay to the latest message', () => {
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 432,
    })

    try {
      renderPresentation(youtubeSnapshot, [
        { id: 'm1', kind: 'text', text: 'Fan: first', senderLabel: 'Fan' },
        { id: 'm2', kind: 'text', text: 'Guest: second', senderLabel: 'Guest' },
      ])

      const chatLog = container.querySelector('.riffsync-cast-receiver__chat-log') as HTMLUListElement | null
      expect(chatLog).not.toBeNull()
      expect(chatLog?.textContent).toContain('Fan: first')
      expect(chatLog?.textContent).toContain('Guest: second')
      expect(chatLog?.scrollTop).toBe(432)
    } finally {
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor)
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
      }
    }
  })

  it('maps waiting stage labels to receiver room-video copy', () => {
    renderPresentation({
      snapshotId: 'snap-waiting-1',
      roomMode: 'theater',
      stagePrimary: { kind: 'live_video_placeholder', label: 'Waiting for party video' },
      chatOverlay: { messages: [] },
    })

    expect(container.textContent).toContain(CAST_RECEIVER_COPY.waitingForRoomVideo)
  })

  it('renders live party video for cast receiver live streams', () => {
    const liveStream = new MediaStream()
    renderPresentation(
      {
        snapshotId: 'snap-live-1',
        roomMode: 'theater',
        stagePrimary: {
          kind: 'live_stream',
          label: 'Party video',
          livePlayback: { roomId: 'room-1', sessionId: 'session-1' },
        },
        chatOverlay: { messages: [] },
      },
      [],
      liveStream,
    )

    const video = container.querySelector('[data-testid="cast-receiver-live-video"]') as HTMLVideoElement | null
    expect(video).not.toBeNull()
    expect(container.textContent).not.toContain(CAST_RECEIVER_COPY.waitingForRoomVideo)
  })

  it('keeps Chromecast receiver presentation read-only without compose or reactions (#318)', () => {
    renderPresentation({
      snapshotId: 'snap-waiting-1',
      roomMode: 'theater',
      stagePrimary: { kind: 'live_video_placeholder', label: 'Party video' },
      chatOverlay: { messages: [] },
    })
    expect(container.querySelector('.riffsync-room-page__tabs')).toBeNull()
    expect(container.querySelector('input[type="text"]')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders video-chat mode using the room participant-grid primary surface', () => {
    renderPresentation({
      snapshotId: 'snap-video-chat-1',
      roomMode: 'videoChat',
      stagePrimary: { kind: 'video_chat_grid', label: 'Participant cameras' },
      chatOverlay: { messages: [] },
    })

    const stagePrimary = container.querySelector('[data-testid="cast-receiver-stage-primary"]')
    expect(stagePrimary?.classList.contains('riffsync-room-page__participant-grid')).toBe(true)
    expect(container.querySelector('.riffsync-room-page__participant-grid-empty')?.textContent).toContain(
      'Participant cameras',
    )
  })

  it.each(RECEIVER_VIEWPORTS)(
    'keeps stage primary and chat overlay within TV layout constraints at $label',
    ({ width, height }) => {
      container.style.width = `${width}px`
      container.style.height = `${height}px`
      renderPresentation(youtubeSnapshot)

      const stage = container.querySelector('.riffsync-cast-receiver__stage') as HTMLElement
      const overlay = container.querySelector('.riffsync-cast-receiver__chat-overlay') as HTMLElement
      const iframe = container.querySelector('.riffsync-cast-receiver__youtube') as HTMLElement

      expect(stage).not.toBeNull()
      expect(overlay).not.toBeNull()
      expect(iframe).not.toBeNull()

      const stageRect = stage.getBoundingClientRect()
      const overlayRect = overlay.getBoundingClientRect()
      const iframeRect = iframe.getBoundingClientRect()

      expect(overlayRect.width).toBeLessThanOrEqual(stageRect.width * 0.4 + 1)
      expect(overlayRect.height).toBeLessThanOrEqual(stageRect.height * 0.45 + 1)
      expect(iframeRect.width).toBeLessThanOrEqual(stageRect.width + 1)
      expect(iframeRect.height).toBeLessThanOrEqual(stageRect.height + 1)
    },
  )
})
