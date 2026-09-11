// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FanProfilePayload } from '../api/fanProfileApi'
import { AccountPage } from './AccountPage'

const navigateToFanAuth = vi.fn<(authPath: string, returnTo?: string) => void>()
const startFanHostedUiSignOut = vi.fn<(logoutUri?: string) => void>()
const useFanSession = vi.fn()
const fetchFanProfile = vi.fn<(token: string) => Promise<FanProfilePayload>>()
const patchFanProfileDisplayName =
  vi.fn<(token: string, name: string) => Promise<FanProfilePayload>>()
const uploadFanProfileAvatar = vi.fn()

vi.mock('../auth/fanAuthNavigation', () => ({
  navigateToFanAuth: (authPath: string, returnTo?: string) => navigateToFanAuth(authPath, returnTo),
}))

vi.mock('../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignOut: (logoutUri?: string) => startFanHostedUiSignOut(logoutUri),
}))

vi.mock('../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../api/fanProfileApi', () => ({
  fetchFanProfile: (token: string) => fetchFanProfile(token),
  patchFanProfileDisplayName: (token: string, name: string) =>
    patchFanProfileDisplayName(token, name),
  uploadFanProfileAvatar: (...args: unknown[]) => uploadFanProfileAvatar(...args),
}))

vi.mock('../session/guestSession', () => ({
  FAN_DISPLAY_NAME_MAX_LEN: 48,
  setGuestDisplayName: (name: string) => name,
}))

function payload(overrides: Partial<FanProfilePayload> = {}): FanProfilePayload {
  return {
    displayName: 'CosmicCrow123',
    updatedAt: 1,
    avatarUrl: 'https://cdn.test/avatar.png',
    avatarUpdatedAt: 1,
    ...overrides,
  }
}

describe('AccountPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    navigateToFanAuth.mockReset()
    startFanHostedUiSignOut.mockReset()
    fetchFanProfile.mockReset()
    patchFanProfileDisplayName.mockReset()
    fetchFanProfile.mockResolvedValue(payload())
    patchFanProfileDisplayName.mockResolvedValue(payload({ displayName: 'New Name' }))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <AccountPage />
        </MemoryRouter>,
      )
    })
  }

  it('shows sign-in prompt when anonymous', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderPage()

    expect(container.textContent).toContain('Sign in to manage your display name')
    expect(container.querySelector('button.gen-button')?.textContent).toBe('Sign In')
    expect(container.querySelector('.riffsync-channel-hero')).not.toBeNull()
    expect(container.querySelector('.riffsync-channel-hero__visual-title')?.textContent).toBe(
      'Account',
    )
    expect(container.querySelector('a[href="/catalog"]')).toBeNull()
  })

  it('starts sign-in with returnTo=/account', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderPage()

    act(() => {
      ;(container.querySelector('button.gen-button') as HTMLButtonElement).click()
    })

    expect(navigateToFanAuth).toHaveBeenCalledWith('/auth/sign-in', '/account')
  })

  it('loads profile and saves display name', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderPage()

    await vi.waitFor(() => {
      expect(fetchFanProfile).toHaveBeenCalledWith('fan-token')
    })

    await vi.waitFor(() => {
      const input = container.querySelector('#riffsync-account-display-name') as HTMLInputElement
      expect(input.value).toBe('CosmicCrow123')
    })

    const input = container.querySelector('#riffsync-account-display-name') as HTMLInputElement

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, 'New Name')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      ;(container.querySelector('.riffsync-account-page__save') as HTMLButtonElement).click()
    })

    await vi.waitFor(() => {
      expect(patchFanProfileDisplayName).toHaveBeenCalledWith('fan-token', 'New Name')
    })
  })

  it('starts forgot-password and sign-out actions', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderPage()

    await vi.waitFor(() => expect(fetchFanProfile).toHaveBeenCalled())

    const changePasswordLink = container.querySelector(
      '[data-testid="fan-account-change-password"]',
    ) as HTMLAnchorElement
    expect(changePasswordLink).not.toBeNull()
    expect(changePasswordLink.getAttribute('href')).toBe('/auth/change-password')
    expect(changePasswordLink.textContent).toBe('Change password')

    const buttons = Array.from(container.querySelectorAll('.riffsync-account-page__actions button'))
    act(() => {
      ;(buttons[0] as HTMLButtonElement).click()
    })
    expect(navigateToFanAuth).toHaveBeenCalledWith('/auth/forgot-password', '/account')

    act(() => {
      ;(buttons[1] as HTMLButtonElement).click()
    })
    expect(startFanHostedUiSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows password reset success banner when query param is set', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/account?passwordReset=1']}>
          <AccountPage />
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => expect(fetchFanProfile).toHaveBeenCalled())

    expect(container.querySelector('.riffsync-account-page__success')?.textContent).toBe(
      'Your password was updated successfully.',
    )
    expect(document.querySelectorAll('h1').length).toBe(1)
    expect(document.querySelector('h1')?.textContent).toBe('Account')
  })
})
