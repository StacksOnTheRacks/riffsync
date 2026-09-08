// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileMenu } from './ProfileMenu'

const startFanHostedUiSignIn = vi.fn<(returnPath: string) => Promise<void>>()
const useFanSession = vi.fn()

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (returnPath: string) => startFanHostedUiSignIn(returnPath),
  startFanHostedUiSignOut: vi.fn(),
}))

vi.mock('../../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProfileMenu', () => {
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

  function renderMenu(path = '/catalog') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <ProfileMenu />
        </MemoryRouter>,
      )
    })
  }

  it('shows Sign In and no Your Parties when signed out', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderMenu()

    expect(container.textContent).toContain('Sign In')
    expect(container.querySelector('a[href="/your-parties"]')).toBeNull()
  })

  it('starts Hosted UI sign-in with the current path', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderMenu('/catalog/mst3k')

    const signIn = container.querySelector('.riffsync-app-shell-profile-sign-in') as HTMLButtonElement
    act(() => {
      signIn.click()
    })

    expect(startFanHostedUiSignIn).toHaveBeenCalledWith('/catalog/mst3k')
  })

  it('includes Your Parties when signed in', () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderMenu()

    const trigger = container.querySelector('.riffsync-app-shell-profile-trigger') as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    expect(container.querySelector('a[href="/your-parties"]')?.textContent).toBe('Your Parties')
  })
})
