// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RoomPageSidebar } from './RoomPageSidebar'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { ChatLine } from './roomPageTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockRoomFriendsPane = vi.fn((props: { visible: boolean }) => {
  void props
  return null
})

vi.mock('../friends/useRoomFriendsPane', () => ({
  useRoomFriendsPane: () => ({
    loading: false,
    loadError: false,
    snapshot: {
      friends: [{ fanSub: 'fan-b', pairKey: 'a#b', displayName: 'Buddy', online: true, hasUnread: true, createdAt: 1 }],
      inbound: [{ requestId: 'req-1', requesterSub: 'fan-c', recipientSub: 'fan-a', createdAt: 2 }],
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
  }),
}))

vi.mock('../friends/RoomFriendsPane', () => ({
  RoomFriendsPane: (props: { visible: boolean }) => {
    mockRoomFriendsPane(props)
    return <div data-testid="room-friends-pane">Friends pane</div>
  },
}))

vi.mock('./usePeopleRosterFriends', () => ({
  usePeopleRosterFriends: () => ({
    snapshot: { friends: [], inbound: [], outbound: [], anyUnread: false },
    myFanSub: 'fan-a',
    statusByFanSub: {},
    invitePeer: vi.fn(),
    cancelPeerRequest: vi.fn(),
    refreshSnapshot: vi.fn(),
  }),
}))

function createParticipantAvControllerStub(): ParticipantAvController {
  const state = {
    cameraEnabled: false,
    micEnabled: false,
    micMuted: false,
    canPublish: true,
    needsProducerToken: false,
    error: null,
    busy: false,
  }
  return {
    getState: () => state,
    getLocalPreviewStream: () => null,
    subscribe: () => () => undefined,
    refreshPublishGate: vi.fn(),
    attachSession: vi.fn(),
    resetOnReconnect: vi.fn(),
    teardownPublishing: vi.fn(),
    enableCamera: vi.fn().mockResolvedValue(undefined),
    disableCamera: vi.fn(),
    enableMic: vi.fn().mockResolvedValue(undefined),
    disableMic: vi.fn(),
    toggleMicMute: vi.fn(),
    failPublish: vi.fn(),
    clearError: vi.fn(),
  }
}

function buildSidebarProps(overrides: Partial<Parameters<typeof RoomPageSidebar>[0]> = {}) {
  return {
    wsBase: 'wss://ws.test.example',
    fanToken: 'fan-jwt',
    roomId: 'room-test-1',
    sessionId: 'sess-test-1',
    myAvatarUrl: null,
    activeSidebarTab: 'chat' as const,
    setRoomSidebarTab: vi.fn(),
    viewerCount: 2,
    chat: [] as ChatLine[],
    chatReactions: {},
    remoteTyping: [],
    chatMemberLabels: new Map<string, string>(),
    chatDraft: '',
    setChatDraft: vi.fn(),
    notifyComposeBlur: vi.fn(),
    chatLogRef: { current: null },
    chatInputRef: { current: null },
    showJumpToLatest: false,
    jumpToLatestLabel: '',
    jumpToLatest: vi.fn(),
    chatDrawerBanner: null,
    chatComposeStatus: { message: null, disableSubmit: false },
    sendChat: vi.fn(),
    sendChatGif: vi.fn(),
    toggleChatReaction: vi.fn(),
    peopleShown: [],
    participantProducerBySessionId: new Map(),
    speakingBySessionId: new Map(),
    isPublisher: false,
    experimentalFeatures: true,
    shareHint: null,
    onCopyShare: vi.fn(),
    onOpenRenameModal: vi.fn(),
    roomVisibility: 'public' as const,
    visibilityBusy: false,
    visibilityErr: null,
    onSelectRoomVisibility: vi.fn(),
    avDisabled: false,
    participantAvController: createParticipantAvControllerStub(),
    announceRoomA11y: vi.fn(),
    profileDraft: '',
    setProfileDraft: vi.fn(),
    profileSaveErr: null,
    profileSaving: false,
    profileAvatarUrl: null,
    profileAvatarLoading: false,
    profileAvatarUploading: false,
    profileAvatarErr: null,
    profileAvatarInputRef: { current: null },
    saveProfileDisplayName: vi.fn(),
    onProfileAvatarSelected: vi.fn(),
    castAvailability: 'checking' as const,
    castStartLifecycle: 'idle' as const,
    onCastToTvClick: vi.fn(),
    castToTvButtonRef: { current: null },
    ...overrides,
  }
}

describe('RoomPageSidebar friends tab (#364)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockRoomFriendsPane.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderSidebar(overrides: Partial<Parameters<typeof RoomPageSidebar>[0]> = {}) {
    act(() => {
      root.render(
        <MemoryRouter>
          <RoomPageSidebar {...buildSidebarProps(overrides)} />
        </MemoryRouter>,
      )
    })
  }

  it('omits Friends tab for guests', () => {
    renderSidebar({ fanToken: null })

    const labels = Array.from(container.querySelectorAll('.riffsync-room-page__tab')).map(
      (node) => node.textContent?.trim(),
    )
    expect(labels).toEqual(['Chat', 'People (2)', 'Room'])
    expect(container.querySelector('.riffsync-room-page__tab-unread-dot')).toBeNull()
  })

  it('shows Friends tab in order Chat, People, Friends, Room, Profile for signed-in fans', () => {
    renderSidebar()

    const labels = Array.from(container.querySelectorAll('.riffsync-room-page__tab')).map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(labels[0]).toBe('Chat')
    expect(labels[1]).toBe('People (2)')
    expect(labels[2]).toMatch(/^Friends/)
    expect(labels[3]).toBe('Room')
    expect(labels[4]).toBe('Profile')
  })

  it('shows aggregate unread dot on Friends tab when anyUnread', () => {
    renderSidebar()

    const friendsTab = Array.from(container.querySelectorAll('.riffsync-room-page__tab')).find((node) =>
      node.textContent?.includes('Friends'),
    )
    expect(friendsTab?.querySelector('.riffsync-room-page__tab-unread-dot')).not.toBeNull()
  })

  it('mounts RoomFriendsPane when Friends tab is active', () => {
    renderSidebar({ activeSidebarTab: 'friends' })

    expect(container.querySelector('[data-testid="room-friends-pane"]')).not.toBeNull()
    expect(mockRoomFriendsPane).toHaveBeenCalledWith(
      expect.objectContaining({ visible: true }),
    )
  })

  it('keeps RoomFriendsPane mounted but hidden when another tab is active', () => {
    renderSidebar({ activeSidebarTab: 'chat' })

    expect(mockRoomFriendsPane).toHaveBeenCalledWith(
      expect.objectContaining({ visible: false }),
    )
  })
})

describe('RoomPageSidebar expanded overlay friends absence (#364)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockRoomFriendsPane.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not render Friends tab strip in expanded overlay', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <RoomPageSidebar {...buildSidebarProps({ presentation: 'overlay' })} />
        </MemoryRouter>,
      )
    })

    expect(container.querySelector('.riffsync-room-page__tabs')).toBeNull()
    expect(mockRoomFriendsPane).not.toHaveBeenCalled()
  })
})
