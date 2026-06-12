// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StageParticipantLayout } from './StageParticipantLayout'
import { VIDEO_CHAT_EMPTY_COPY } from './stageParticipantTiles'

describe('StageParticipantLayout', () => {
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

  function renderLayout(
    overrides: Partial<Parameters<typeof StageParticipantLayout>[0]> = {},
  ) {
    act(() => {
      root.render(
        <StageParticipantLayout
          roomMode="theater"
          tiles={[]}
          layoutUpdating={false}
          viewportWide
          avSurfacesEnabled
          playback={<div className="playback-fixture">Movie</div>}
          {...overrides}
        />,
      )
    })
  }

  it('renders theater playback on theater mode', () => {
    renderLayout({ roomMode: 'theater' })
    expect(container.querySelector('.playback-fixture')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-page__stage-media--theater')).not.toBeNull()
  })

  it('shows video chat empty copy when grid has no tiles', () => {
    renderLayout({ roomMode: 'videoChat', viewportWide: true })
    expect(container.textContent).toContain(VIDEO_CHAT_EMPTY_COPY)
    expect(container.querySelector('.playback-fixture')).toBeNull()
  })

  it('shows layout updating status while transitioning', () => {
    renderLayout({ layoutUpdating: true })
    expect(container.textContent).toContain('Updating room layout')
  })

  it('renders self tile in desktop theater strip', () => {
    const stream = new MediaStream()
    renderLayout({
      roomMode: 'theater',
      viewportWide: true,
      tiles: [
        {
          key: 'self',
          sessionId: 'me',
          label: 'You',
          isSelf: true,
          stream,
        },
      ],
    })
    expect(container.querySelector('.riffsync-room-page__participant-strip--desktop')).not.toBeNull()
    expect(container.textContent).toContain('You')
  })

  it('unmounts participant tiles when removed from the list', () => {
    const stream = new MediaStream([{ kind: 'video' } as MediaStreamTrack])
    const tile = {
      key: 'remote-1',
      sessionId: 'remote-1',
      label: 'Alice',
      isSelf: false,
      stream,
    }
    renderLayout({
      roomMode: 'videoChat',
      viewportWide: true,
      tiles: [tile],
    })
    const video = container.querySelector(
      'video.riffsync-room-page__participant-tile-video',
    ) as HTMLVideoElement | null
    expect(video?.srcObject).toBe(stream)

    renderLayout({
      roomMode: 'videoChat',
      viewportWide: true,
      tiles: [],
    })
    expect(container.querySelector('video.riffsync-room-page__participant-tile-video')).toBeNull()
    expect(container.querySelector('figure[aria-label="Alice"]')).toBeNull()
    expect(document.body.querySelector('figure[aria-label="Alice"]')).toBeNull()
    expect(video?.srcObject).toBeNull()
  })

  it('renders narrow horizontal row below primary on small viewport', () => {
    const stream = new MediaStream()
    renderLayout({
      roomMode: 'theater',
      viewportWide: false,
      tiles: [
        {
          key: 'self',
          sessionId: 'me',
          label: 'You',
          isSelf: true,
          stream,
        },
      ],
    })
    expect(container.querySelector('.riffsync-room-page__participant-row--narrow')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-page__participant-strip--desktop')).toBeNull()
  })
})
