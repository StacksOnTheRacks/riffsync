// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FanProfilePayload } from '../../api/fanProfileApi'
import { ProfileMenu } from './ProfileMenu'

const startFanHostedUiSignIn = vi.fn<(returnPath: string) => Promise<void>>()
const useFanSession = vi.fn()
const fetchFanProfile = vi.fn<(token: string) => Promise<FanProfilePayload>>()

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (returnPath: string) => startFanHostedUiSignIn(returnPath),
  startFanHostedUiSignOut: vi.fn(),
}))

vi.mock('../../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../../api/fanProfileApi', () => ({
  fetchFanProfile: (token: string) => fetchFanProfile(token),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProfileMenu', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    startFanHostedUiSignIn.mockReset()
    startFanHostedUiSignIn.mockResolvedValue(undefined)
    fetchFanProfile.mockReset()
    fetchFanProfile.mockResolvedValue({
      displayName: 'Account',
      updatedAt: 1,
      avatarUrl: null,
      avatarUpdatedAt: null,
    })
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

    expect(container.querySelector('[aria-label="Sign In"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Sign In')
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
    expect(container.querySelector('a[href="/account"]')?.textContent).toBe('Profile')
  })

  it('shows the signed-in avatar in the header trigger', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchFanProfile.mockResolvedValue({
      displayName: 'Derrick',
      updatedAt: 1,
      avatarUrl: 'https://cdn.test/me.png',
      avatarUpdatedAt: 1,
    })
    renderMenu()

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-app-shell-profile-trigger img')?.getAttribute('src')).toBe(
        'https://cdn.test/me.png',
      )
    })
    expect(container.querySelector('.riffsync-app-shell-profile-trigger img')?.getAttribute('alt')).toBe(
      'Derrick',
    )
    expect(fetchFanProfile).toHaveBeenCalledWith('fan-token')
  })

  it('uses the display-name initial when the profile has no avatar', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchFanProfile.mockResolvedValue({
      displayName: 'Derrick',
      updatedAt: 1,
      avatarUrl: null,
      avatarUpdatedAt: null,
    })
    renderMenu()

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-fan-avatar-thumb--initials')?.textContent).toBe('D')
    })
  })
})
