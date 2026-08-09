// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RoomPageSidebar } from './RoomPageSidebar'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { PresenceMember } from './roomPageTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const invitePeer = vi.fn()
const cancelPeerRequest = vi.fn()

vi.mock('../auth/jwtDecode', () => ({
  cognitoSub: () => 'fan-a',
}))

vi.mock('./usePeopleRosterFriends', () => ({
  usePeopleRosterFriends: () => ({
    snapshot: {
      friends: [],
      inbound: [],
      outbound: [],
      anyUnread: false,
    },
    myFanSub: 'fan-a',
    loading: false,
    statusByFanSub: {},
    invitePeer,
    cancelPeerRequest,
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

const peerWithFanSub: PresenceMember = {
  sessionId: 'sess-peer',
  displayName: 'Peer Fan',
  isHost: false,
  fanSub: 'fan-b',
}

const guestPeer: PresenceMember = {
  sessionId: 'sess-guest',
  displayName: 'Guest',
  isHost: false,
}

const selfRow: PresenceMember = {
  sessionId: 'sess-self',
  displayName: 'You',
  isHost: false,
  fanSub: 'fan-a',
}

function buildSidebarProps(peopleShown: PresenceMember[]) {
  return {
    wsBase: 'wss://ws.test.example',
    fanToken: 'fan-jwt',
    roomId: 'room-test-1',
    sessionId: 'sess-self',
    myAvatarUrl: null,
    activeSidebarTab: 'people' as const,
    setRoomSidebarTab: vi.fn(),
    viewerCount: peopleShown.length,
    chat: [],
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
    peopleShown,
    participantProducerBySessionId: new Map(),
    speakingBySessionId: new Map(),
    isPublisher: false,
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
    castAvailability: 'unavailable' as const,
    castStartLifecycle: 'idle' as const,
    onCastToTvClick: vi.fn(),
    castToTvButtonRef: { current: null },
    linkTvPanelOpen: false,
    linkTvActive: false,
    onLinkTvClick: vi.fn(),
    onLinkTvClose: vi.fn(),
    onLinkTvSubmitCode: async () => {},
    onStopLinkTv: vi.fn(),
    linkTvButtonRef: { current: null },
    theaterShareQuality: 'balanced' as const,
    onTheaterShareQualityChange: vi.fn(),
  }
}

describe('RoomPageSidebar People roster friend menu (#377)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    invitePeer.mockReset()
    cancelPeerRequest.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPeople(peopleShown: PresenceMember[]) {
    act(() => {
      root.render(
        <MemoryRouter>
          <RoomPageSidebar {...buildSidebarProps(peopleShown)} />
        </MemoryRouter>,
      )
    })
  }

  it('shows More actions only for eligible peer rows with fanSub', () => {
    renderPeople([peerWithFanSub, guestPeer, selfRow])

    const overflowButtons = container.querySelectorAll('.riffsync-room-page__people-row-overflow')
    expect(overflowButtons).toHaveLength(1)
    expect(overflowButtons[0]?.getAttribute('aria-label')).toBe('More actions for Peer Fan')
  })

  it('Add friend posts invite for peer fanSub from overflow menu', () => {
    renderPeople([peerWithFanSub])

    const overflow = container.querySelector('.riffsync-room-page__people-row-overflow') as HTMLButtonElement
    act(() => {
      overflow.click()
    })

    const addFriend = container.querySelector('.riffsync-room-page__people-row-menu-item') as HTMLButtonElement
    expect(addFriend.textContent).toBe('Add friend')
    act(() => {
      addFriend.click()
    })

    expect(invitePeer).toHaveBeenCalledWith('fan-b')
  })

  it('opens the same menu from keyboard overflow control', () => {
    renderPeople([peerWithFanSub])

    const overflow = container.querySelector('.riffsync-room-page__people-row-overflow') as HTMLButtonElement
    act(() => {
      overflow.focus()
      overflow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      overflow.click()
    })

    expect(container.querySelector('.riffsync-room-page__people-row-menu')).not.toBeNull()
  })
})
