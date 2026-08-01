// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomFriendsPane } from './RoomFriendsPane'
import type { RoomFriendsPaneState } from './useRoomFriendsPane'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: () => 'fan-jwt',
}))

vi.mock('../auth/jwtDecode', () => ({
  cognitoSub: () => 'fan-a',
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

describe('RoomFriendsPane (#364)', () => {
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

  it('renders friends list with online label and unread dot', () => {
    act(() => {
      root.render(<RoomFriendsPane pane={buildPaneState()} visible />)
    })

    expect(container.textContent).toContain('Buddy')
    expect(container.textContent).toContain('Online in a watch party')
    expect(container.querySelector('.riffsync-room-friends-unread-dot')).not.toBeNull()
  })

  it('renders empty friends copy when roster has no friends', () => {
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({
            snapshot: { friends: [], inbound: [], outbound: [], anyUnread: false },
          })}
          visible
        />,
      )
    })

    expect(container.textContent).toContain('No friends yet.')
  })

  it('renders outbound pending with cancel and keeps empty friends copy', () => {
    const cancelRequest = vi.fn()
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({
            snapshot: {
              friends: [],
              inbound: [],
              outbound: [
                {
                  requestId: 'req-out-1',
                  requesterSub: 'fan-a',
                  recipientSub: 'fan-c',
                  createdAt: 3,
                  displayName: 'Christen Servo',
                },
              ],
              anyUnread: false,
            },
            cancelRequest,
          })}
          visible
        />,
      )
    })

    expect(container.textContent).toContain('Pending requests')
    expect(container.textContent).toContain('Christen Servo')
    expect(container.textContent).toContain('Cancel request')
    expect(container.textContent).toContain('No friends yet.')

    const cancelButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('Cancel request'),
    )
    expect(cancelButton).not.toBeUndefined()
    cancelButton?.click()
    expect(cancelRequest).toHaveBeenCalledWith('req-out-1')
  })

  it('renders inbound pending accept and decline actions', () => {
    const acceptRequest = vi.fn()
    const declineRequest = vi.fn()
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({
            snapshot: {
              friends: [],
              inbound: [
                {
                  requestId: 'req-in-1',
                  requesterSub: 'fan-c',
                  recipientSub: 'fan-a',
                  createdAt: 2,
                  displayName: 'TVs Frank III',
                },
              ],
              outbound: [],
              anyUnread: false,
            },
            acceptRequest,
            declineRequest,
          })}
          visible
        />,
      )
    })

    const acceptButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('Accept'),
    )
    const declineButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('Decline'),
    )
    acceptButton?.click()
    declineButton?.click()
    expect(container.textContent).toContain('TVs Frank III')
    expect(acceptRequest).toHaveBeenCalledWith('req-in-1')
    expect(declineRequest).toHaveBeenCalledWith('req-in-1')
  })

  it('renders nested DM thread with back control and empty copy', () => {
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({
            openPeer: {
              fanSub: 'fan-b',
              pairKey: 'a#b',
              displayName: 'Buddy',
            },
            dmMessages: [],
          })}
          visible
        />,
      )
    })

    expect(container.querySelector('.riffsync-room-friends-dm-header')).not.toBeNull()
    expect(container.textContent).toContain('Back to friends')
    expect(container.textContent).toContain('No messages yet. Say hello.')
    expect(container.querySelector('.riffsync-room-friends-dm-compose')).not.toBeNull()
  })

  it('shows closed conversation copy after remove', () => {
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({
            openPeer: {
              fanSub: 'fan-b',
              pairKey: 'a#b',
              displayName: 'Buddy',
            },
            dmClosed: true,
          })}
          visible
        />,
      )
    })

    expect(container.textContent).toContain('This conversation is closed.')
    expect(container.querySelector('.riffsync-room-friends-dm-compose')).toBeNull()
  })

  it('shows load failure copy with retry', () => {
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({ loadError: true, snapshot: null })}
          visible
        />,
      )
    })

    expect(container.textContent).toContain('Could not load friends. Try again.')
  })

  it('focuses Cancel and dismisses remove dialog on Escape', () => {
    const cancelRemove = vi.fn()
    act(() => {
      root.render(
        <RoomFriendsPane
          pane={buildPaneState({
            removeTarget: {
              fanSub: 'fan-b',
              pairKey: 'a#b',
              displayName: 'Buddy',
              online: false,
              hasUnread: false,
              createdAt: 1,
            },
            cancelRemove,
          })}
          visible
        />,
      )
    })

    const cancelButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('Cancel'),
    )
    expect(document.activeElement).toBe(cancelButton)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(cancelRemove).toHaveBeenCalled()
  })
})
