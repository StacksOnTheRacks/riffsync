// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG_HUB_ENTRY_LINKS } from '../../catalog/catalogBrowseIa'
import { Sidebar } from './Sidebar'

const useFanSession = vi.fn()
const useShowGetAppNav = vi.fn()
const fetchFriendRosterSnapshot = vi.fn()

vi.mock('../../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../../pwa/useShowGetAppNav', () => ({
  useShowGetAppNav: () => useShowGetAppNav(),
}))

vi.mock('../../friends/friendsApi', () => ({
  fetchFriendRosterSnapshot: (...args: unknown[]) => fetchFriendRosterSnapshot(...args),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Sidebar Figma rail', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useFanSession.mockReturnValue({ fanToken: null })
    useShowGetAppNav.mockReturnValue(true)
    fetchFriendRosterSnapshot.mockResolvedValue({
      friends: [],
      inbound: [],
      outbound: [],
      anyUnread: false,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderSidebar(path = '/') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Sidebar id="riffsync-app-shell-sidebar" collapsed={false} mobileOpen={false} />
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
  }

  function sidebarHrefs() {
    return [...container.querySelectorAll('.riffsync-app-shell-sidebar-nav a')]
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href): href is string => Boolean(href))
  }

  it('lists catalog channels as peers without season or era nesting', async () => {
    await renderSidebar()

    expect(container.textContent).not.toContain('By Season')
    expect(container.textContent).not.toContain('Season 1')
    expect(container.textContent).not.toContain('By Era')
    expect(sidebarHrefs()).toEqual(
      expect.arrayContaining(CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href)),
    )
    expect(sidebarHrefs().filter((href) => href.includes('/season/'))).toEqual([])
    expect(container.querySelector('a[href="/catalog"]')).toBeNull()
  })

  it('uses Figma labels and icons for the unauthenticated rail', async () => {
    await renderSidebar()

    expect(container.querySelector('a[href="/"]')?.textContent).toBe('Home')
    expect(container.querySelector('a[href="/live"]')?.textContent).toBe('Live Now')
    expect(container.querySelector('a[href="/your-parties"]')).toBeNull()
    expect(container.querySelector('a[href="/lobby"]')).toBeNull()
    expect(container.querySelector('a[href="/account"]')).toBeNull()
    expect(container.querySelector('a[href="/download"]')?.textContent).toBe('Download App')
    expect(container.textContent).toContain('More from RiffSync')
    expect(container.querySelector('img[src="/app-shell/sidebar/home.svg"]')).not.toBeNull()
    expect(container.querySelector('img[src="/app-shell/sidebar/mst3k.jpg"]')).not.toBeNull()
    expect(container.querySelector('img[src="/app-shell/sidebar/rifftrax.png"]')).not.toBeNull()
  })

  it('adds signed-in destinations from SidebarAuthenticated', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    await renderSidebar()

    expect(container.querySelector('a[href="/your-parties"]')?.textContent).toBe('Your Parties')
    expect(container.querySelector('a[href="/account"]')?.textContent).toBe('Settings')
    expect(container.querySelector('a[href="/how-to-host-a-watchparty"]')?.textContent).toBe(
      'How to Host',
    )
    expect(container.querySelector('a[href="https://github.com/StacksOnTheRacks/riffsync/discussions"]')?.textContent).toBe(
      'Send Feedback',
    )
    expect(container.querySelector('img[src="/app-shell/sidebar/your-parties.svg"]')).not.toBeNull()
  })

  it('lists signed-in friends and can expand the remainder', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchFriendRosterSnapshot.mockResolvedValue({
      friends: Array.from({ length: 9 }, (_, index) => ({
        fanSub: `fan-${index}`,
        pairKey: `pair-${index}`,
        displayName: `Friend ${index + 1}`,
        online: false,
        hasUnread: false,
        createdAt: index,
      })),
      inbound: [],
      outbound: [],
      anyUnread: false,
    })
    await renderSidebar()

    expect(container.textContent).toContain('Friends')
    expect(container.textContent).toContain('Friend 1')
    expect(container.textContent).toContain('Friend 7')
    expect(container.textContent).not.toContain('Friend 8')
    expect(container.textContent).toContain('Show 2 more')

    await act(async () => {
      container.querySelector('.riffsync-app-shell-nav-more')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })

    expect(container.textContent).toContain('Friend 8')
    expect(container.textContent).toContain('Friend 9')
  })

  it('marks Home active on the index route', async () => {
    await renderSidebar('/')

    const homeItem = container.querySelector('a[href="/"]')?.closest('.riffsync-app-shell-nav-item')
    expect(homeItem?.classList.contains('is-active')).toBe(true)
  })

  it('keeps legal footer links in the expanded rail', async () => {
    await renderSidebar()

    expect(container.querySelector('a[href="/terms"]')?.textContent).toBe('Terms')
    expect(container.querySelectorAll('a[href="/privacy"]')).toHaveLength(2)
    expect(container.textContent).toContain('Galaxy Class, LLC')
  })
})
