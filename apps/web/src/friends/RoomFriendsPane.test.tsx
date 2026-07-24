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
})
