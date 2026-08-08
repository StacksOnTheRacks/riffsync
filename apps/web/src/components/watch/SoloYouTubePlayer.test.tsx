// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SoloYouTubePlayer,
  YOUTUBE_EMBED_BROKEN_MESSAGE,
} from './SoloYouTubePlayer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type PlayerHandlers = {
  onReady?: (e: { target: { playVideo: () => void; destroy: () => void } }) => void
  onError?: (e: { data: number }) => void
}

describe('SoloYouTubePlayer', () => {
  let container: HTMLDivElement
  let root: Root
  let lastHandlers: PlayerHandlers | undefined
  let constructShouldThrow = false
  let destroyImpl: (() => void) | undefined

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    lastHandlers = undefined
    constructShouldThrow = false
    destroyImpl = undefined

    const FakePlayer = class {
      playVideo = vi.fn()
      destroy = vi.fn()

      constructor(_host: string | HTMLElement, options: { events?: PlayerHandlers }) {
        if (constructShouldThrow) {
          throw new Error('YT.Player construct failed')
        }
        lastHandlers = options.events
        this.playVideo = vi.fn()
        this.destroy = vi.fn(() => {
          destroyImpl?.()
        })
      }
    }

    window.YT = {
      Player: FakePlayer as unknown as NonNullable<Window['YT']>['Player'],
    }
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete window.YT
    delete window.onYouTubeIframeAPIReady
    document.querySelectorAll(`script[src="https://www.youtube.com/iframe_api"]`).forEach((el) => {
      el.remove()
    })
  })

  function renderPlayer(watchUrl?: string | null) {
    act(() => {
      root.render(
        <SoloYouTubePlayer
          videoId="badVideoId1"
          titleHint="Broken stream"
          autoPlay={false}
          watchUrl={watchUrl}
        />,
      )
    })
  }

  it('shows friendly broken-link copy and Open on YouTube on IFrame API onError', async () => {
    renderPlayer('https://www.youtube.com/watch?v=badVideoId1')

    await vi.waitFor(() => {
      expect(lastHandlers?.onError).toBeTypeOf('function')
    })

    act(() => {
      lastHandlers?.onError?.({ data: 150 })
    })

    expect(container.textContent).toContain(YOUTUBE_EMBED_BROKEN_MESSAGE)
    expect(container.textContent).not.toMatch(/Playback error/)
    const link = container.querySelector('a[href="https://www.youtube.com/watch?v=badVideoId1"]')
    expect(link?.textContent).toBe('Open on YouTube')
    expect(container.querySelector('.riffsync-solo-player__frame')).toBeNull()
  })

  it('recovers from YT.Player construct throw without uncaught render crash', async () => {
    constructShouldThrow = true
    renderPlayer(null)

    await vi.waitFor(() => {
      expect(container.textContent).toContain(YOUTUBE_EMBED_BROKEN_MESSAGE)
    })

    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector('.riffsync-solo-player')).not.toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })

  it('recovers when destroy throws during onError cleanup', async () => {
    destroyImpl = () => {
      throw new Error('destroy failed')
    }
    renderPlayer('https://www.youtube.com/watch?v=badVideoId1')

    await vi.waitFor(() => {
      expect(lastHandlers?.onError).toBeTypeOf('function')
    })

    act(() => {
      lastHandlers?.onError?.({ data: 100 })
    })

    expect(container.textContent).toContain(YOUTUBE_EMBED_BROKEN_MESSAGE)
    expect(container.querySelector('.riffsync-solo-player')).not.toBeNull()
  })

  it('keeps a React-owned outer frame while the host mounts', async () => {
    renderPlayer()

    await vi.waitFor(() => {
      expect(lastHandlers?.onReady).toBeTypeOf('function')
    })

    expect(container.querySelector('.riffsync-solo-player__frame')).not.toBeNull()

    act(() => {
      lastHandlers?.onReady?.({
        target: {
          playVideo: vi.fn(),
          destroy: vi.fn(),
        },
      })
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('.riffsync-solo-player__frame')).not.toBeNull()
  })
})
