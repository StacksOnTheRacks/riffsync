// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ParticipantVideoTile } from './ParticipantVideoTile'
import type { StageParticipantTile } from './stageParticipantTiles'

describe('ParticipantVideoTile', () => {
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

  function makeTile(
    label: string,
    isSelf: boolean,
    stream: MediaStream = new MediaStream([{ kind: 'video' } as MediaStreamTrack]),
  ): StageParticipantTile {
    return {
      key: isSelf ? 'self' : 'remote-1',
      sessionId: isSelf ? 'me' : 'remote-1',
      label,
      isSelf,
      stream,
    }
  }

  function renderTile(tile: StageParticipantTile) {
    act(() => {
      root.render(<ParticipantVideoTile tile={tile} />)
    })
  }

  function videoElement(): HTMLVideoElement | null {
    return container.querySelector('video.riffsync-room-page__participant-tile-video')
  }

  it('exposes per-tile accessible name for local You tile', () => {
    renderTile(makeTile('You', true))
    const figure = container.querySelector('figure.riffsync-room-page__participant-tile')
    expect(figure?.getAttribute('aria-label')).toBe('You')
    expect(figure?.textContent).toContain('You')
  })

  it('exposes per-tile accessible name for remote display name', () => {
    renderTile(makeTile('Alice', false))
    const figure = container.querySelector('figure.riffsync-room-page__participant-tile')
    expect(figure?.getAttribute('aria-label')).toBe('Alice')
    expect(figure?.textContent).toContain('Alice')
  })

  it('clears srcObject on unmount', () => {
    const stream = new MediaStream([{ kind: 'video' } as MediaStreamTrack])
    renderTile(makeTile('Alice', false, stream))
    const video = videoElement()
    expect(video?.srcObject).toBe(stream)

    act(() => root.unmount())
    expect(video?.srcObject).toBeNull()
  })

  it('clears srcObject when stream identity changes', () => {
    const firstStream = new MediaStream([{ kind: 'video' } as MediaStreamTrack])
    const secondStream = new MediaStream([{ kind: 'video' } as MediaStreamTrack])
    renderTile(makeTile('Alice', false, firstStream))
    const video = videoElement()
    expect(video?.srcObject).toBe(firstStream)

    renderTile(makeTile('Alice', false, secondStream))
    expect(video?.srcObject).toBe(secondStream)
    expect(video?.srcObject).not.toBe(firstStream)
  })
})
