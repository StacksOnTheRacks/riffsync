// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './SiteHeader'

const startFanHostedUiSignIn = vi.fn<(returnPath: string) => Promise<void>>()
const useFanSession = vi.fn()

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (returnPath: string) => startFanHostedUiSignIn(returnPath),
}))

vi.mock('../../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../../room/useRoomChrome', () => ({
  useRoomChromeOptional: () => null,
}))

describe('SiteHeader fan session nav', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    startFanHostedUiSignIn.mockReset()
    startFanHostedUiSignIn.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHeader(path = '/catalog') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <SiteHeader />
        </MemoryRouter>,
      )
    })
  }

  it('shows Sign In when anonymous', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderHeader('/catalog?era=joel')

    expect(container.querySelector('a[href="/account"]')).toBeNull()
    expect(container.textContent).toContain('Sign In')
    expect(container.textContent).toContain('Lobby')
  })

  it('starts Hosted UI sign-in with the current path', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderHeader('/lobby')

    const signIn = container.querySelector('.riffsync-site-nav-sign-in') as HTMLButtonElement
    act(() => {
      signIn.click()
    })

    expect(startFanHostedUiSignIn).toHaveBeenCalledWith('/lobby')
  })

  it('shows Account link when signed in', () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderHeader()

    expect(container.querySelector('a[href="/account"]')?.textContent).toBe('Account')
    expect(container.querySelector('.riffsync-site-nav-sign-in')).toBeNull()
  })
})
