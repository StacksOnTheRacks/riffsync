import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RIFFSYNC_AV_TOGGLE_STATUS_ID,
  RIFFSYNC_CHAT_COMPOSE_STATUS_ID,
  RIFFSYNC_CHAT_DRAWER_STATUS_ID,
  RIFFSYNC_SFU_CONFIG_ALERT_ID,
  RIFFSYNC_THEATER_AUDIO_STATUS_ID,
  RIFFSYNC_VIDEO_RELAY_STATUS_ID,
  messageForDrawerError,
  messageForParticipantAvError,
  resolveChatComposeStatus,
  resolveChatDrawerBanner,
  resolveSfuConfigAlert,
  resolveTheaterAudioStatus,
  resolveVideoRelayStatusLine,
  selectDrawerPresentation,
} from './drawerErrorPresentation'

describe('drawerErrorPresentation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  it('exports stable surface id constants', () => {
    expect(RIFFSYNC_CHAT_DRAWER_STATUS_ID).toBe('riffsync-chat-drawer-status')
    expect(RIFFSYNC_VIDEO_RELAY_STATUS_ID).toBe('riffsync-video-relay-status')
    expect(RIFFSYNC_CHAT_COMPOSE_STATUS_ID).toBe('riffsync-chat-compose-status')
    expect(RIFFSYNC_AV_TOGGLE_STATUS_ID).toBe('riffsync-av-toggle-status')
    expect(RIFFSYNC_THEATER_AUDIO_STATUS_ID).toBe('riffsync-theater-audio-status')
    expect(RIFFSYNC_SFU_CONFIG_ALERT_ID).toBe('riffsync-sfu-config-alert')
  })

  it('maps drawer lifecycle copy from presentation.md', () => {
    expect(resolveChatDrawerBanner({ state: 'reconnecting' })).toBe('Reconnecting chat…')
    expect(resolveChatDrawerBanner({ state: 'degraded' })).toBe(
      'Chat unavailable. Try refreshing the page.',
    )
    expect(
      resolveVideoRelayStatusLine({
        sfu: { state: 'reconnecting' },
        isPublisher: false,
        guestShareFsm: 'running',
      }),
    ).toBe('Video relay reconnecting…')
    expect(
      resolveVideoRelayStatusLine({
        sfu: { state: 'degraded' },
        isPublisher: false,
        guestShareFsm: 'running',
      }),
    ).toBe('Video relay unavailable. Try refreshing the page.')
  })

  it('maps error codes from error_state.md', () => {
    expect(messageForDrawerError('CHAT_SEND_DROPPED')).toBe(
      'Message could not be sent. Check chat connection and try again.',
    )
    expect(messageForDrawerError('ICE_FAILED')).toBe(
      'Network connection failed. Check your network or VPN and try again.',
    )
    expect(messageForDrawerError('PLAYBACK_AUDIO_BLOCKED')).toContain('Party audio is blocked')
  })

  it('appends dev code suffix when import.meta.env.DEV is true', () => {
    vi.stubEnv('DEV', true)
    expect(messageForDrawerError('CHAT_SEND_DROPPED')).toContain('(code: CHAT_SEND_DROPPED)')
    expect(messageForParticipantAvError('permission_denied')).toContain('(code: permission_denied)')
  })

  it('omits dev code suffix in production builds', () => {
    vi.stubEnv('DEV', false)
    expect(messageForDrawerError('CHAT_SEND_DROPPED')).not.toContain('(code:')
  })

  it('shows independent chat compose status without SFU input', () => {
    expect(
      resolveChatComposeStatus({
        state: 'reconnecting',
      }),
    ).toEqual({
      message: 'Reconnecting chat…',
      disableSubmit: true,
    })
    expect(
      resolveChatComposeStatus({
        state: 'connected',
        lastErrorCode: 'CHAT_SEND_DROPPED',
      }),
    ).toEqual({
      message: 'Message could not be sent. Check chat connection and try again.',
      disableSubmit: true,
    })
    expect(resolveChatComposeStatus({ state: 'connected' })).toEqual({
      message: null,
      disableSubmit: false,
    })
  })

  it('surfaces config-class SFU errors on the page alert target', () => {
    expect(
      resolveSfuConfigAlert({
        state: 'degraded',
        lastErrorCode: 'LOCAL_SFU_UNREACHABLE',
      }),
    ).toContain('Local video relay is not running')
    expect(resolveSfuConfigAlert({ state: 'connected' })).toBeNull()
  })

  it('shows theater audio status for blocked and suspended codes', () => {
    expect(
      resolveTheaterAudioStatus({
        state: 'connected',
        lastErrorCode: 'PLAYBACK_AUDIO_BLOCKED',
      }),
    ).toContain('Party audio is blocked')
    expect(
      resolveTheaterAudioStatus({
        state: 'connected',
        lastErrorCode: 'THEATER_AUDIO_SUSPENDED',
      }),
    ).toContain('Party audio is paused')
  })

  it('keeps guest host-screen FSM copy on the video-relay surface when SFU drawer is healthy', () => {
    expect(
      resolveVideoRelayStatusLine({
        sfu: { state: 'connected' },
        isPublisher: false,
        guestShareFsm: 'idle',
      }),
    ).toBe('Waiting for host to share…')
  })

  it('keeps chat reconnect copy off the video-relay surface (#201)', () => {
    const chatReconnecting = 'Reconnecting chat…'
    const retiredCombinedCopy = 'Reconnecting chat… Video may pause briefly.'
    const presentation = selectDrawerPresentation(
      {
        roomId: 'room-1',
        sessionId: 'sess-1',
        asOf: new Date(0).toISOString(),
        drawers: {
          chat: { state: 'reconnecting' },
          sfuSignaling: { state: 'connected' },
          theaterPlayback: { state: 'connected' },
        },
        activeErrorCodes: [],
      },
      { guestShareFsm: 'running', isPublisher: false },
    )
    expect(presentation.chatDrawerBanner).toBe(chatReconnecting)
    expect(presentation.videoRelayStatus).toBeNull()
    expect(presentation.videoRelayStatus).not.toBe(chatReconnecting)
    expect(presentation.videoRelayStatus).not.toBe(retiredCombinedCopy)
  })

  it('allows simultaneous chat and video-relay banners from diagnostics', () => {
    const presentation = selectDrawerPresentation(
      {
        roomId: 'room-1',
        sessionId: 'sess-1',
        asOf: new Date(0).toISOString(),
        drawers: {
          chat: { state: 'reconnecting' },
          sfuSignaling: { state: 'degraded', lastErrorCode: 'ICE_FAILED' },
          theaterPlayback: { state: 'connected' },
        },
        activeErrorCodes: ['ICE_FAILED'],
      },
      { guestShareFsm: 'running', isPublisher: false },
    )
    expect(presentation.chatDrawerBanner).toBe('Reconnecting chat…')
    expect(presentation.videoRelayStatus).toContain('Network connection failed')
  })

  it('maps drawer status surfaces to stable ids for aria-describedby wiring', () => {
    expect(RIFFSYNC_AV_TOGGLE_STATUS_ID).toBe('riffsync-av-toggle-status')
    expect(RIFFSYNC_CHAT_DRAWER_STATUS_ID).toBe('riffsync-chat-drawer-status')
    expect(RIFFSYNC_VIDEO_RELAY_STATUS_ID).toBe('riffsync-video-relay-status')
    expect(RIFFSYNC_CHAT_COMPOSE_STATUS_ID).toBe('riffsync-chat-compose-status')
    expect(RIFFSYNC_THEATER_AUDIO_STATUS_ID).toBe('riffsync-theater-audio-status')
  })
})

describe('chat drawer banner and compose inline feedback (#207)', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders chat drawer banner from chat lifecycle state only', () => {
    expect(resolveChatDrawerBanner({ state: 'reconnecting' })).toBe('Reconnecting chat…')
    expect(resolveChatDrawerBanner({ state: 'degraded' })).toBe(
      'Chat unavailable. Try refreshing the page.',
    )
    expect(resolveChatDrawerBanner({ state: 'connected' })).toBeNull()
  })

  it('shows CHAT_SEND_DROPPED inline compose copy without SFU input', () => {
    expect(
      resolveChatComposeStatus({
        state: 'connected',
        lastErrorCode: 'CHAT_SEND_DROPPED',
      }),
    ).toEqual({
      message: 'Message could not be sent. Check chat connection and try again.',
      disableSubmit: true,
    })
  })

  it('keeps compose enabled when chat is connected and SFU video relay is unhealthy', () => {
    const presentation = selectDrawerPresentation(
      {
        roomId: 'room-1',
        sessionId: 'sess-1',
        asOf: new Date(0).toISOString(),
        drawers: {
          chat: { state: 'connected' },
          sfuSignaling: { state: 'reconnecting' },
          theaterPlayback: { state: 'connected' },
        },
        activeErrorCodes: [],
      },
      { guestShareFsm: 'running', isPublisher: false },
    )

    expect(presentation.chatComposeStatus).toEqual({
      message: null,
      disableSubmit: false,
    })
    expect(presentation.chatDrawerBanner).toBeNull()
    expect(presentation.videoRelayStatus).toBe('Video relay reconnecting…')
  })

  it('clears inline compose feedback when chat recovers to connected without lastErrorCode', () => {
    const afterDrop = resolveChatComposeStatus({
      state: 'connected',
      lastErrorCode: 'CHAT_SEND_DROPPED',
    })
    const afterRecovery = resolveChatComposeStatus({ state: 'connected' })

    expect(afterDrop.message).not.toBeNull()
    expect(afterRecovery).toEqual({
      message: null,
      disableSubmit: false,
    })
    expect(resolveChatDrawerBanner({ state: 'connected' })).toBeNull()
  })

  it('does not derive chat drawer banner from SFU diagnostics', () => {
    const presentation = selectDrawerPresentation(
      {
        roomId: 'room-1',
        sessionId: 'sess-1',
        asOf: new Date(0).toISOString(),
        drawers: {
          chat: { state: 'connected' },
          sfuSignaling: { state: 'degraded', lastErrorCode: 'ICE_FAILED' },
          theaterPlayback: { state: 'connected' },
        },
        activeErrorCodes: ['ICE_FAILED'],
      },
      { guestShareFsm: 'running', isPublisher: false },
    )

    expect(presentation.chatDrawerBanner).toBeNull()
    expect(presentation.videoRelayStatus).toContain('Network connection failed')
  })
})
