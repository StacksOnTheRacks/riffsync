// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CastReceiverPresentation } from './CastReceiverPresentation'
import type { CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

  function renderPresentation(snapshot: CastPresentationSnapshot | null, chatMessages = snapshot?.chatOverlay.messages ?? []) {
    act(() => {
      root.render(<CastReceiverPresentation snapshot={snapshot} chatMessages={chatMessages} />)
    })
  }

  it('renders stage-primary video and chat overlay from sender snapshot', () => {
    const snapshot: CastPresentationSnapshot = {
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

    renderPresentation(snapshot)
    expect(container.querySelector('[data-testid="cast-receiver-stage-primary"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="cast-receiver-chat-overlay"]')).not.toBeNull()
    expect(container.textContent).toContain('Fan: hello')
    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('abc123')
  })

  it('does not render sidebar tabs or compose controls', () => {
    const snapshot: CastPresentationSnapshot = {
      roomMode: 'theater',
      stagePrimary: { kind: 'live_video_placeholder', label: 'Party video' },
      chatOverlay: { messages: [] },
    }

    renderPresentation(snapshot)
    expect(container.querySelector('.riffsync-room-page__tabs')).toBeNull()
    expect(container.querySelector('input[type="text"]')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})
