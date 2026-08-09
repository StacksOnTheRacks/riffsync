// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RoomPageSidebar } from './RoomPageSidebar'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { ChatLine } from './roomPageTypes'
import { RIFFSYNC_CHAT_DRAWER_STATUS_ID } from './drawerErrorPresentation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const sampleChat: ChatLine[] = [
  {
    kind: 'text',
    messageId: 'msg-1',
    sessionId: 'sess-other',
    displayName: 'Fan',
    text: 'hello from chat',
    ts: 1,
  },
]

function buildSidebarProps(overrides: Partial<Parameters<typeof RoomPageSidebar>[0]> = {}) {
  return {
    presentation: 'overlay' as const,
    wsBase: 'wss://ws.test.example',
    fanToken: 'fan-jwt',
    roomId: 'room-test-1',
    sessionId: 'sess-test-1',
    myAvatarUrl: null,
    activeSidebarTab: 'chat' as const,
    setRoomSidebarTab: vi.fn(),
    viewerCount: 2,
    chat: sampleChat,
    chatReactions: {},
    remoteTyping: [],
    chatMemberLabels: new Map<string, string>(),
    chatDraft: '',
    setChatDraft: vi.fn(),
    notifyComposeBlur: vi.fn(),
    chatLogRef: { current: null },
    chatInputRef: { current: null },
    showJumpToLatest: true,
    jumpToLatestLabel: 'New messages (2)',
    jumpToLatest: vi.fn(),
    chatDrawerBanner: 'Reconnecting chat…',
    chatComposeStatus: { message: null, disableSubmit: false },
    sendChat: vi.fn(),
    sendChatGif: vi.fn(),
    toggleChatReaction: vi.fn(),
    peopleShown: [],
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
    castAvailability: 'checking' as const,
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
    ...overrides,
  }
}

describe('RoomPageSidebar expanded overlay chat (#318)', () => {
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

  function renderSidebar(overrides: Partial<Parameters<typeof RoomPageSidebar>[0]> = {}) {
    act(() => {
      root.render(
        <MemoryRouter>
          <RoomPageSidebar {...buildSidebarProps(overrides)} />
        </MemoryRouter>,
      )
    })
  }

  it('keeps regular expanded overlay chat interactive with compose, reactions, and jump-to-latest', () => {
    renderSidebar()

    const overlay = container.querySelector('.riffsync-room-page__chat--overlay')
    expect(overlay).not.toBeNull()
    expect(container.querySelector('.riffsync-room-page__tabs')).toBeNull()
    expect(overlay?.querySelector('.riffsync-room-chat-compose')).not.toBeNull()
    expect(overlay?.querySelector('.riffsync-room-chat-reaction-add')).not.toBeNull()
    expect(overlay?.querySelector('.riffsync-room-chat-jump-latest')?.textContent).toBe('New messages (2)')
    expect(overlay?.querySelector(`#${RIFFSYNC_CHAT_DRAWER_STATUS_ID}`)?.textContent).toBe(
      'Reconnecting chat…',
    )
    expect(container.textContent).toContain('hello from chat')
  })

  it('shows participant A/V toggles in expanded overlay for signed-in fans', () => {
    renderSidebar()

    expect(container.querySelector('.riffsync-room-page__chat--overlay .riffsync-room-av')).not.toBeNull()
  })

  it('keeps anonymous expanded overlay readable with the existing sign-in gate', () => {
    renderSidebar({ fanToken: null })

    const overlay = container.querySelector('.riffsync-room-page__chat--overlay')
    expect(overlay?.querySelector('.riffsync-room-chat-signin-overlay')).not.toBeNull()
    expect(overlay?.querySelector('.riffsync-room-chat-compose-send')?.hasAttribute('disabled')).toBe(true)
    expect(overlay?.querySelector('.riffsync-room-chat-reaction-add')).toBeNull()
    expect(container.textContent).toContain('hello from chat')
  })

  it('invokes sendChat from expanded overlay compose when enabled', () => {
    const sendChat = vi.fn()
    renderSidebar({ sendChat, chatDraft: 'expanded hello' })

    const input = container.querySelector('input[placeholder="Say something…"]') as HTMLInputElement
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(sendChat).toHaveBeenCalledTimes(1)
  })
})
