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

  function renderTile(label: string, isSelf: boolean) {
    const stream = new MediaStream([{ kind: 'video' } as MediaStreamTrack])
    const tile: StageParticipantTile = {
      key: isSelf ? 'self' : 'remote-1',
      sessionId: isSelf ? 'me' : 'remote-1',
      label,
      isSelf,
      stream,
    }
    act(() => {
      root.render(<ParticipantVideoTile tile={tile} />)
    })
  }

  it('exposes per-tile accessible name for local You tile', () => {
    renderTile('You', true)
    const figure = container.querySelector('figure.riffsync-room-page__participant-tile')
    expect(figure?.getAttribute('aria-label')).toBe('You')
    expect(figure?.textContent).toContain('You')
  })

  it('exposes per-tile accessible name for remote display name', () => {
    renderTile('Alice', false)
    const figure = container.querySelector('figure.riffsync-room-page__participant-tile')
    expect(figure?.getAttribute('aria-label')).toBe('Alice')
    expect(figure?.textContent).toContain('Alice')
  })
})
