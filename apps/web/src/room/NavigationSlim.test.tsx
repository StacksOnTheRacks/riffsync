// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FanProfilePayload } from '../api/fanProfileApi'
import { NavigationSlim } from './NavigationSlim'

const navigateToFanAuth = vi.fn<(authPath: string, returnTo?: string) => void>()
const startFanHostedUiSignOut = vi.fn()
const useFanSession = vi.fn()
const fetchFanProfile = vi.fn<(token: string) => Promise<FanProfilePayload>>()

vi.mock('../auth/fanAuthNavigation', () => ({
  navigateToFanAuth: (authPath: string, returnTo?: string) => navigateToFanAuth(authPath, returnTo),
}))

vi.mock('../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignOut: () => startFanHostedUiSignOut(),
}))

vi.mock('../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../api/fanProfileApi', () => ({
  fetchFanProfile: (token: string) => fetchFanProfile(token),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('NavigationSlim', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    navigateToFanAuth.mockReset()
    startFanHostedUiSignOut.mockReset()
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

  function renderSlim(path = '/room/room-test-1', title = 'MST3K Episode 1') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <NavigationSlim title={title} />
        </MemoryRouter>,
      )
    })
  }

  it('renders logo home link to /', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderSlim()

    const logo = container.querySelector('.riffsync-navigation-slim__logo') as HTMLAnchorElement
    expect(logo).not.toBeNull()
    expect(logo.getAttribute('aria-label')).toBe('RiffSync home')
    expect(logo.getAttribute('href')).toBe('/')
  })

  it('renders signed-out Sign in and navigates with room returnTo', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderSlim('/room/room-test-1?tab=chat')

    const signIn = container.querySelector('.riffsync-navigation-slim__sign-in') as HTMLButtonElement
    expect(signIn).not.toBeNull()
    expect(signIn.textContent).toBe('Sign in')
    expect(signIn.getAttribute('aria-expanded')).toBeNull()

    act(() => {
      signIn.click()
    })

    expect(navigateToFanAuth).toHaveBeenCalledWith('/auth/sign-in', '/room/room-test-1?tab=chat')
  })

  it('renders signed-in account menu with Account and Sign out', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderSlim()

    await vi.waitFor(() => {
      expect(fetchFanProfile).toHaveBeenCalledWith('fan-token')
    })

    const trigger = container.querySelector('.riffsync-navigation-slim__profile-trigger') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Account')
    expect(container.textContent).toContain('Sign out')
    expect(container.querySelector('a[href="/your-parties"]')).toBeNull()

    const signOut = [...container.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === 'Sign out',
    ) as HTMLButtonElement
    act(() => {
      signOut.click()
    })
    expect(startFanHostedUiSignOut).toHaveBeenCalled()
  })

  it('closes the menu on Escape and returns focus to the trigger', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderSlim()

    await vi.waitFor(() => {
      expect(fetchFanProfile).toHaveBeenCalled()
    })

    const trigger = container.querySelector('.riffsync-navigation-slim__profile-trigger') as HTMLButtonElement
    act(() => {
      trigger.click()
      trigger.focus()
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('does not render Leave party or Friends controls', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderSlim()

    expect(container.textContent).not.toContain('Leave party')
    expect(container.querySelector('.riffsync-navigation-slim__leave')).toBeNull()
    expect(container.querySelector('[aria-label="Friends"]')).toBeNull()
    expect(container.querySelector('[aria-label="Profile menu"]')).toBeNull()
  })

  it('renders exactly one sr-only primary heading with the passed title', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderSlim('/room/room-test-1', 'Party Night')

    const headings = container.querySelectorAll('h1.sr-only')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Party Night')
    expect(container.querySelector('.riffsync-navigation-slim__title')).toBeNull()
    expect(container.textContent).not.toContain('Host')
  })
})
