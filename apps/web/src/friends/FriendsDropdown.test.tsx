// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendsDropdown } from './FriendsDropdown'
import type { RoomFriendsPaneState } from './useRoomFriendsPane'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockUseRoomFriendsPane = vi.fn()

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: () => 'fan-jwt',
}))

vi.mock('../auth/jwtDecode', () => ({
  cognitoSub: () => 'fan-a',
}))

vi.mock('./useRoomFriendsPane', () => ({
  useRoomFriendsPane: (...args: unknown[]) => mockUseRoomFriendsPane(...args),
}))

function buildPaneState(overrides: Partial<RoomFriendsPaneState> = {}): RoomFriendsPaneState {
  return {
    loading: false,
    loadError: false,
    snapshot: {
      friends: [
        {
          fanSub: 'fan-b',
          pairKey: 'a#b',
          displayName: 'Buddy',
          online: true,
          hasUnread: true,
          createdAt: 1,
        },
      ],
      inbound: [],
      outbound: [],
      anyUnread: true,
    },
    openPeer: null,
    dmMessages: [],
    dmClosed: false,
    dmLoading: false,
    dmDraft: '',
    dmComposeError: null,
    removeTarget: null,
    anyUnread: true,
    setDmDraft: vi.fn(),
    refreshRoster: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    cancelRequest: vi.fn(),
    openDm: vi.fn(),
    closeDm: vi.fn(),
    confirmRemove: vi.fn(),
    cancelRemove: vi.fn(),
    executeRemove: vi.fn(),
    sendDm: vi.fn(),
    ...overrides,
  }
}

describe('FriendsDropdown (#363)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockUseRoomFriendsPane.mockReset()
    mockUseRoomFriendsPane.mockReturnValue(buildPaneState())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders person-icon trigger with aggregate unread dot', () => {
    act(() => {
      root.render(<FriendsDropdown />)
    })

    const trigger = container.querySelector('#gen-user-btn') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    expect(trigger.getAttribute('aria-label')).toBe('Friends')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.fa-user')).not.toBeNull()
    expect(container.querySelector('.riffsync-friends-nav__unread-dot')).not.toBeNull()
  })

  it('toggles dropdown disclosure with aria-expanded', () => {
    act(() => {
      root.render(<FriendsDropdown />)
    })

    const trigger = container.querySelector('#gen-user-btn') as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Buddy')
    expect(container.textContent).toContain('Online in a watch party')
    expect(container.querySelector('.riffsync-friends-dropdown')).not.toBeNull()

    act(() => {
      trigger.click()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.riffsync-friends-dropdown')).toBeNull()
  })

  it('renders pending request peer names in the dropdown', () => {
    mockUseRoomFriendsPane.mockReturnValue(
      buildPaneState({
        snapshot: {
          friends: [],
          inbound: [
            {
              requestId: 'req-in-1',
              requesterSub: 'fan-b',
              recipientSub: 'fan-a',
              createdAt: 1,
              displayName: 'Christen Servo',
            },
          ],
          outbound: [
            {
              requestId: 'req-out-1',
              requesterSub: 'fan-a',
              recipientSub: 'fan-c',
              createdAt: 2,
              displayName: 'TVs Frank III',
            },
          ],
          anyUnread: false,
        },
      }),
    )

    act(() => {
      root.render(<FriendsDropdown />)
    })
    const trigger = container.querySelector('#gen-user-btn') as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    expect(container.textContent).toContain('Christen Servo')
    expect(container.textContent).toContain('TVs Frank III')
    expect(container.textContent).toContain('Accept')
    expect(container.textContent).toContain('Cancel request')
    expect(container.querySelectorAll('.riffsync-room-friends-row--pending')).toHaveLength(2)
    expect(container.querySelectorAll('.riffsync-room-friends-pending-identity')).toHaveLength(2)
  })

  it('opens DM overlay from friend row and shows empty durable copy', () => {
    const openDm = vi.fn()
    mockUseRoomFriendsPane.mockReturnValue(
      buildPaneState({
        openDm,
        openPeer: {
          fanSub: 'fan-b',
          pairKey: 'a#b',
          displayName: 'Buddy',
        },
        dmMessages: [],
        dmLoading: false,
      }),
    )

    act(() => {
      root.render(<FriendsDropdown />)
    })

    const trigger = container.querySelector('#gen-user-btn') as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    // Re-render path: after click, openDm is invoked; simulate pending+openPeer via next mock.
    mockUseRoomFriendsPane.mockReturnValue(
      buildPaneState({
        openDm,
        openPeer: {
          fanSub: 'fan-b',
          pairKey: 'a#b',
          displayName: 'Buddy',
        },
        dmMessages: [],
      }),
    )

    const openButton = container.querySelector('.riffsync-room-friends-row-open') as HTMLButtonElement
    act(() => {
      openButton.click()
    })

    expect(openDm).toHaveBeenCalled()
    expect(document.body.textContent).toContain('No messages yet. Say hello.')
    expect(document.querySelector('.riffsync-friends-dm-overlay')).not.toBeNull()
  })

  it('shows remove confirm dialog copy', () => {
    mockUseRoomFriendsPane.mockReturnValue(
      buildPaneState({
        removeTarget: {
          fanSub: 'fan-b',
          pairKey: 'a#b',
          displayName: 'Buddy',
          online: false,
          hasUnread: false,
          createdAt: 1,
        },
      }),
    )

    act(() => {
      root.render(<FriendsDropdown />)
    })

    expect(document.body.textContent).toContain('Remove friend?')
    expect(document.body.textContent).toContain('This removes Buddy for both of you')
  })
})
