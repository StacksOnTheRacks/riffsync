// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { FanAvatarThumb, type FanAvatarThumbProps } from './FanAvatarThumb'

function renderThumb(el: HTMLElement, props: FanAvatarThumbProps): Root {
  const root = createRoot(el)
  act(() => {
    root.render(<FanAvatarThumb {...props} />)
  })
  return root
}

describe('FanAvatarThumb', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it('renders initials when avatarUrl is missing', () => {
    container = document.createElement('div')
    root = renderThumb(container, { displayName: '  ada lovelace ' })
    const initials = container.querySelector('.riffsync-fan-avatar-thumb--initials')
    expect(initials?.textContent).toBe('A')
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders img for https avatarUrl', () => {
    container = document.createElement('div')
    root = renderThumb(container, {
      displayName: 'Fan',
      avatarUrl: 'https://cdn.example.test/avatars/u.png',
    })
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://cdn.example.test/avatars/u.png')
    expect(img?.getAttribute('alt')).toBe('Fan')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('falls back to initials when image fails to load', () => {
    container = document.createElement('div')
    root = renderThumb(container, {
      displayName: 'Broken',
      avatarUrl: 'https://cdn.example.test/missing.png',
    })
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    act(() => {
      img?.dispatchEvent(new Event('error'))
    })
    const initials = container.querySelector('.riffsync-fan-avatar-thumb--initials')
    expect(initials?.textContent).toBe('B')
    expect(container.querySelector('img')).toBeNull()
  })

  it('uses initials for non-https avatarUrl', () => {
    container = document.createElement('div')
    root = renderThumb(container, {
      displayName: 'Guest',
      avatarUrl: 'http://insecure.example/avatar.png',
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.riffsync-fan-avatar-thumb--initials')?.textContent).toBe('G')
  })
})
