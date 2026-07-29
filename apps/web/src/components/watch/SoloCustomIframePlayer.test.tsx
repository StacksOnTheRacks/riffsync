// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SoloCustomIframePlayer } from './SoloCustomIframePlayer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SoloCustomIframePlayer', () => {
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

  function renderPlayer() {
    act(() => {
      root.render(
        <SoloCustomIframePlayer
          customPlaybackUrl="https://example.test/movie"
          title="Test Movie"
        />,
      )
    })
  }

  it('renders iframe with customPlaybackUrl, title, and allow attrs', () => {
    renderPlayer()

    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('https://example.test/movie')
    expect(iframe?.getAttribute('title')).toBe('Test Movie')
    expect(iframe?.getAttribute('allow')).toBe('autoplay; fullscreen; encrypted-media')
  })

  it('shows embed-blocked copy when iframe fires error', () => {
    renderPlayer()

    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()

    act(() => {
      iframe?.dispatchEvent(new Event('error'))
    })

    expect(container.textContent).toContain('This page could not be embedded in RiffSync.')
    expect(container.querySelector('a[href="https://example.test/movie"]')?.textContent).toBe(
      'Open the movie page in a new tab.',
    )
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('transitions from loading to ready on iframe load', () => {
    renderPlayer()

    expect(container.querySelector('.sr-only')?.textContent).toBe('Loading playback.')

    const iframe = container.querySelector('iframe')
    act(() => {
      iframe?.dispatchEvent(new Event('load'))
    })

    expect(container.querySelector('.sr-only')).toBeNull()
    expect(container.querySelector('iframe')).not.toBeNull()
  })
})
